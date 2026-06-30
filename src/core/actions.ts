import type { CardInstance, GamePhase, GameState, LegalAction, PlayerId, PlayerState, StackItem } from "./types.js";
import { addMana, canPayManaCost, getManaAbilities, spendManaCost } from "./mana.js";
import {
  getAdditionalCostOptions,
  getEffectiveManaCost,
  hasPayableAdditionalCosts,
} from "./costs.js";
import { getSpellTargetOptions, resolveNonCreatureSpell } from "./spells.js";
import { getActivatedAbilityActions, resolveActivatedAbility } from "./activatedAbilities.js";
import { assertGameStateIsValid } from "./validateGameState.js";
import { dispatchGameEvent } from "./triggerEngine.js";
import { applyContinuousEffects } from "./staticEffects.js";

function isMainPhase(phase: GamePhase): boolean {
  return phase === "main1" || phase === "main2";
}

function isCreature(instance: CardInstance): boolean {
  return instance.card.cardTypes.includes("Creature");
}

function entersTapped(instance: CardInstance): boolean {
  return /\benters tapped\b/i.test(instance.card.gameText);
}

function cannotDefend(instance: CardInstance): boolean {
  return /\bcan't defend\b/i.test(instance.card.gameText);
}

function hasSubtype(instance: CardInstance, subtype: string): boolean {
  return new RegExp(`\\b${subtype}\\b`, "i").test(instance.card.typeLine) || (instance.additionalSubtypes ?? []).includes(subtype);
}

export function getPlayer(game: GameState, playerId: PlayerId): PlayerState {
  const player = game.players.find((candidate) => candidate.playerId === playerId);

  if (!player) {
    throw new Error(`Unknown player ${playerId}.`);
  }

  return player;
}

export function getOpponent(game: GameState, playerId: PlayerId): PlayerState {
  const opponent = game.players.find((candidate) => candidate.playerId !== playerId);

  if (!opponent) {
    throw new Error(`Player ${playerId} has no opponent.`);
  }

  return opponent;
}

export function getPriorityOrder(game: GameState): [PlayerId, PlayerId] {
  const attackingPlayer = getPlayer(game, game.attackingPriorityPlayerId);
  const opponent = getOpponent(game, attackingPlayer.playerId);
  return [attackingPlayer.playerId, opponent.playerId];
}

function canPayFullSpellCost(player: PlayerState, cardInstance: CardInstance): boolean {
  return hasPayableAdditionalCosts(player, cardInstance);
}

function getTargetingAdditionalManaCost(game: GameState, controllerId: PlayerId, targetIds: string[]): string {
  const controller = getPlayer(game, controllerId);
  const wardCosts: string[] = [];

  for (const targetId of targetIds) {
    const targetController = game.players.find((player) =>
      player.battlefield.some((permanent) => permanent.instanceId === targetId),
    );
    const target = targetController?.battlefield.find((permanent) => permanent.instanceId === targetId);

    if (!target || targetController?.playerId === controller.playerId) {
      continue;
    }

    const wardMatch = target.card.gameText.match(/\bWard ((?:\{[^}]+})+)/i);

    if (wardMatch) {
      wardCosts.push(wardMatch[1]);
    }
  }

  return wardCosts.join("");
}

function getCastManaCost(game: GameState, player: PlayerState, card: CardInstance, action: Extract<LegalAction, { type: "castSpell" }>): string {
  return `${getEffectiveManaCost(player, card, action.additionalCosts)}${getTargetingAdditionalManaCost(
    game,
    player.playerId,
    action.targetIds,
  )}`;
}

function createCastSpellActions(game: GameState, player: PlayerState, cardInstance: CardInstance): LegalAction[] {
  const actions: LegalAction[] = [];

  for (const additionalCosts of getAdditionalCostOptions(player, cardInstance)) {
    for (const targetIds of getSpellTargetOptions(game, player.playerId, cardInstance.card)) {
      const manaCost = `${getEffectiveManaCost(player, cardInstance, additionalCosts)}${getTargetingAdditionalManaCost(
        game,
        player.playerId,
        targetIds,
      )}`;

      if (!canPayManaCost(player.manaPool, manaCost)) {
        continue;
      }

      actions.push({
        type: "castSpell",
        playerId: player.playerId,
        cardInstanceId: cardInstance.instanceId,
        targetIds,
        additionalCosts,
      });
    }
  }

  return actions;
}

export function getLegalActions(game: GameState, playerId: PlayerId): LegalAction[] {
  if (game.status === "gameOver") {
    return [];
  }

  const player = getPlayer(game, playerId);
  const actions: LegalAction[] = [];

  if (isMainPhase(game.phase)) {
    for (const ability of getManaAbilities(player, game.turnNumber)) {
      actions.push({
        type: "activateManaAbility",
        playerId,
        permanentId: ability.permanentId,
        mana: ability.mana,
        amount: ability.amount,
      });
    }
  }

  if ((isMainPhase(game.phase) || game.phase === "combat") && game.stack.length === 0) {
    actions.push(...getActivatedAbilityActions(game, playerId));
  }

  if (isMainPhase(game.phase) && game.stack.length > 0) {
    for (const cardInstance of player.hand) {
      if (
        !isCreature(cardInstance) &&
        /Counter target spell/i.test(cardInstance.card.gameText) &&
        canPayFullSpellCost(player, cardInstance)
      ) {
        actions.push(...createCastSpellActions(game, player, cardInstance));
      }
    }
  }

  if (isMainPhase(game.phase) && game.stack.length === 0) {
    for (const cardInstance of player.hand) {
      if (isCreature(cardInstance) && canPayManaCost(player.manaPool, getEffectiveManaCost(player, cardInstance))) {
        actions.push({
          type: "playCreature",
          playerId,
          cardInstanceId: cardInstance.instanceId,
        });
      } else if (!isCreature(cardInstance) && canPayFullSpellCost(player, cardInstance)) {
        actions.push(...createCastSpellActions(game, player, cardInstance));
      }
    }
  }

  actions.push({
    type: "pass",
    playerId,
  });

  return actions;
}

function detachAttachmentsFromPermanent(game: GameState, permanentId: string): void {
  for (const player of game.players) {
    for (const attachment of [...player.battlefield]) {
      if (attachment.attachedToId !== permanentId) {
        continue;
      }

      attachment.attachedToId = null;

      if (attachment.card.cardTypes.includes("Enchantment")) {
        player.battlefield = player.battlefield.filter((candidate) => candidate.instanceId !== attachment.instanceId);
        player.graveyard.push(attachment);
      }
    }
  }
}

function payAdditionalCosts(game: GameState, player: PlayerState, source: CardInstance, action: LegalAction): void {
  if (action.type !== "castSpell") {
    return;
  }

  for (const cost of action.additionalCosts) {
    if (cost.type === "mana") {
      continue;
    }

    if (cost.type === "discard") {
      const discardIndex = player.hand.findIndex((candidate) => candidate.instanceId === cost.cardInstanceId);
      const [discarded] = discardIndex === -1 ? [] : player.hand.splice(discardIndex, 1);

      if (!discarded) {
        throw new Error(`${player.playerId} cannot pay discard additional cost for ${source.card.name}.`);
      }

      player.graveyard.push(discarded);
      dispatchGameEvent(game, {
        type: "cardDiscarded",
        playerId: player.playerId,
        sourceId: source.instanceId,
        targetId: discarded.instanceId,
      });
      game.log.push({
        turn: game.turnNumber,
        phase: game.phase,
        message: `${player.playerId} discards ${discarded.card.name} to cast ${source.card.name}.`,
      });
    }

    if (cost.type === "sacrificeCreature") {
      const sacrificeIndex = player.battlefield.findIndex((candidate) => candidate.instanceId === cost.permanentId);
      const [sacrificed] = sacrificeIndex === -1 ? [] : player.battlefield.splice(sacrificeIndex, 1);

      if (!sacrificed) {
        throw new Error(`${player.playerId} cannot sacrifice ${cost.permanentId} for ${source.card.name}.`);
      }

      sacrificed.tapped = false;
      sacrificed.damageMarked = 0;
      sacrificed.deathtouchDamageMarked = 0;
      sacrificed.powerModifier = 0;
      sacrificed.toughnessModifier = 0;
      sacrificed.staticPowerModifier = 0;
      sacrificed.staticToughnessModifier = 0;
      sacrificed.basePowerOverride = null;
      sacrificed.baseToughnessOverride = null;
      sacrificed.staticKeywords = [];
      sacrificed.temporaryKeywords = [];
      sacrificed.additionalSubtypes = [];
      sacrificed.losesAbilities = false;
      sacrificed.cannotAttack = false;
      sacrificed.cannotDefend = false;
      sacrificed.temporaryCannotDefend = false;
      sacrificed.attachedToId = null;
      sacrificed.doesNotUntap = false;
      sacrificed.activatedAbilityIdsUsed = [];
      detachAttachmentsFromPermanent(game, sacrificed.instanceId);
      player.graveyard.push(sacrificed);
      dispatchGameEvent(game, {
        type: "creatureSacrificed",
        playerId: player.playerId,
        sourceId: source.instanceId,
        targetId: sacrificed.instanceId,
      });
      game.log.push({
        turn: game.turnNumber,
        phase: game.phase,
        message: `${player.playerId} sacrifices ${sacrificed.card.name} to cast ${source.card.name}.`,
      });
    }
  }
}

function removeFromHand(player: PlayerState, cardInstanceId: string): CardInstance {
  const cardIndex = player.hand.findIndex((instance) => instance.instanceId === cardInstanceId);

  if (cardIndex === -1) {
    throw new Error(`Card ${cardInstanceId} is not in ${player.playerId}'s hand.`);
  }

  const [card] = player.hand.splice(cardIndex, 1);
  return card;
}

function pushCreatureSpell(game: GameState, player: PlayerState, card: CardInstance): StackItem {
  const stackItem: StackItem = {
    id: `stack:${game.turnNumber}:${game.stack.length + 1}:${card.instanceId}`,
    controllerId: player.playerId,
    source: card,
    kind: "creatureSpell",
    targetIds: [],
    additionalCosts: [],
  };

  game.stack.push(stackItem);
  return stackItem;
}

export function performAction(game: GameState, action: LegalAction): void {
  const legalActions = getLegalActions(game, action.playerId);
  const isLegal = legalActions.some((legalAction) => {
    if (legalAction.type !== action.type) return false;
    if (legalAction.playerId !== action.playerId) return false;
    if (legalAction.type === "pass" && action.type === "pass") return true;
    if (legalAction.type === "activateManaAbility" && action.type === "activateManaAbility") {
      return (
        legalAction.permanentId === action.permanentId &&
        legalAction.mana === action.mana &&
        legalAction.amount === action.amount
      );
    }
    if (legalAction.type === "activateAbility" && action.type === "activateAbility") {
      return (
        legalAction.sourceId === action.sourceId &&
        legalAction.abilityId === action.abilityId &&
        legalAction.targetIds.length === action.targetIds.length &&
        legalAction.targetIds.every((targetId, index) => targetId === action.targetIds[index])
      );
    }
    if (legalAction.type === "playCreature" && action.type === "playCreature") {
      return legalAction.cardInstanceId === action.cardInstanceId;
    }
    if (legalAction.type === "castSpell" && action.type === "castSpell") {
      return (
        legalAction.cardInstanceId === action.cardInstanceId &&
        legalAction.targetIds.length === action.targetIds.length &&
        legalAction.targetIds.every((targetId, index) => targetId === action.targetIds[index]) &&
        JSON.stringify(legalAction.additionalCosts) === JSON.stringify(action.additionalCosts)
      );
    }
    return false;
  });

  if (!isLegal) {
    throw new Error(`Illegal action ${action.type} by ${action.playerId}.`);
  }

  if (action.type === "pass") {
    game.log.push({
      turn: game.turnNumber,
      phase: game.phase,
      message: `${action.playerId} passes.`,
    });
    assertGameStateIsValid(game, `after ${action.playerId} passes`);
    return;
  }

  const player = getPlayer(game, action.playerId);

  if (action.type === "activateManaAbility") {
    const permanent = player.battlefield.find((candidate) => candidate.instanceId === action.permanentId);

    if (!permanent) {
      throw new Error(`Permanent ${action.permanentId} is not on ${player.playerId}'s battlefield.`);
    }

    permanent.tapped = true;
    player.manaPool = addMana(player.manaPool, action.mana, action.amount);
    if (permanent.card.id === "carnelian_orb_of_dragonkind" && action.mana === "R") {
      player.dragonHasteMana += action.amount;
    }
    game.log.push({
      turn: game.turnNumber,
      phase: game.phase,
      message: `${player.playerId} taps ${permanent.card.name} for ${action.amount} ${action.mana} mana.`,
    });
    dispatchGameEvent(game, {
      type: "manaProduced",
      playerId: player.playerId,
      sourceId: permanent.instanceId,
      amount: action.amount,
      details: { mana: action.mana, cardId: permanent.card.id },
    });
    assertGameStateIsValid(game, `after ${player.playerId} activates ${permanent.card.name}`);
    return;
  }

  if (action.type === "activateAbility") {
    resolveActivatedAbility(game, action);
    applyContinuousEffects(game);
    assertGameStateIsValid(game, `after ${player.playerId} activates ${action.abilityId}`);
    return;
  }

  const card = removeFromHand(player, action.cardInstanceId);
  const manaCost = action.type === "castSpell" ? getCastManaCost(game, player, card, action) : getEffectiveManaCost(player, card);
  const redManaBefore = player.manaPool.R;
  player.manaPool = spendManaCost(player.manaPool, manaCost);
  const redManaSpent = Math.max(0, redManaBefore - player.manaPool.R);
  const dragonHasteManaSpent = Math.min(player.dragonHasteMana, redManaSpent);

  if (action.type === "playCreature" && dragonHasteManaSpent > 0 && hasSubtype(card, "Dragon")) {
    card.temporaryKeywords.push("Haste");
  }

  player.dragonHasteMana -= dragonHasteManaSpent;
  payAdditionalCosts(game, player, card, action);
  if (action.type === "playCreature") {
    pushCreatureSpell(game, player, card);
  } else {
    game.stack.push({
      id: `stack:${game.turnNumber}:${game.stack.length + 1}:${card.instanceId}`,
      controllerId: player.playerId,
      source: card,
      kind: "nonCreatureSpell",
      targetIds: action.targetIds,
      additionalCosts: action.additionalCosts,
    });
  }

  game.log.push({
    turn: game.turnNumber,
    phase: game.phase,
    message: `${player.playerId} casts ${card.card.name}.`,
  });
  dispatchGameEvent(game, {
    type: "spellCast",
    playerId: player.playerId,
    sourceId: card.instanceId,
    details: { cardId: card.card.id, kind: action.type === "playCreature" ? "creatureSpell" : "nonCreatureSpell" },
  });
  assertGameStateIsValid(game, `after ${player.playerId} casts ${card.card.name}`);
}

export function resolveTopOfStack(game: GameState): void {
  const stackItem = game.stack.pop();

  if (!stackItem) {
    return;
  }

  if (stackItem.kind === "creatureSpell") {
    const controller = getPlayer(game, stackItem.controllerId);
    const grantedKeywordsOnStack = [...stackItem.source.temporaryKeywords];
    stackItem.source.enteredTurn = game.turnNumber;
    stackItem.source.tapped = entersTapped(stackItem.source);
    stackItem.source.damageMarked = 0;
    stackItem.source.deathtouchDamageMarked = 0;
    stackItem.source.powerModifier = 0;
    stackItem.source.toughnessModifier = 0;
    stackItem.source.staticPowerModifier = 0;
    stackItem.source.staticToughnessModifier = 0;
    stackItem.source.basePowerOverride = null;
    stackItem.source.baseToughnessOverride = null;
    stackItem.source.staticKeywords = [];
    stackItem.source.temporaryKeywords = grantedKeywordsOnStack;
    stackItem.source.additionalSubtypes = [];
    stackItem.source.losesAbilities = false;
    stackItem.source.cannotAttack = false;
    stackItem.source.cannotDefend = cannotDefend(stackItem.source);
    stackItem.source.temporaryCannotDefend = false;
    stackItem.source.attachedToId = null;
    stackItem.source.exiledById = null;
    stackItem.source.doesNotUntap = false;
    stackItem.source.activatedAbilityIdsUsed = [];
    stackItem.source.returnTappedWithCounterOnDeathUntilEndOfTurn = false;
    controller.battlefield.push(stackItem.source);
    dispatchGameEvent(game, {
      type: "creatureEntered",
      playerId: controller.playerId,
      sourceId: stackItem.source.instanceId,
      details: { cardId: stackItem.source.card.id },
    });

    game.log.push({
      turn: game.turnNumber,
      phase: game.phase,
      message: `${stackItem.source.card.name} resolves onto ${controller.playerId}'s battlefield.`,
    });
  } else {
    resolveNonCreatureSpell(game, stackItem);
  }

  applyContinuousEffects(game);
  dispatchGameEvent(game, {
    type: "spellResolved",
    playerId: stackItem.controllerId,
    sourceId: stackItem.source.instanceId,
    details: { cardId: stackItem.source.card.id, kind: stackItem.kind },
  });
  assertGameStateIsValid(game, `after resolving ${stackItem.source.card.name}`);
}
