import type { CardInstance, GamePhase, GameState, LegalAction, PlayerId, PlayerState, StackItem } from "./types.js";
import { canPayManaCost, spendManaCost } from "./mana.js";
import { getAdditionalManaCost, getSpellTargetOptions, requiresAdditionalDiscard, resolveNonCreatureSpell } from "./spells.js";
import { assertGameStateIsValid } from "./validateGameState.js";

function isMainPhase(phase: GamePhase): boolean {
  return phase === "main1" || phase === "main2";
}

function isCreature(instance: CardInstance): boolean {
  return instance.card.cardTypes.includes("Creature");
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
  if (requiresAdditionalDiscard(cardInstance.card) && player.hand.length < 2) {
    return false;
  }

  return canPayManaCost(player.manaPool, `${cardInstance.card.manaCost}${getAdditionalManaCost(cardInstance.card)}`);
}

export function getLegalActions(game: GameState, playerId: PlayerId): LegalAction[] {
  if (game.status === "gameOver") {
    return [];
  }

  const player = getPlayer(game, playerId);
  const actions: LegalAction[] = [];

  if (isMainPhase(game.phase) && game.stack.length > 0) {
    for (const cardInstance of player.hand) {
      if (
        !isCreature(cardInstance) &&
        /Counter target spell/i.test(cardInstance.card.gameText) &&
        canPayFullSpellCost(player, cardInstance)
      ) {
        for (const targetIds of getSpellTargetOptions(game, playerId, cardInstance.card)) {
          actions.push({
            type: "castSpell",
            playerId,
            cardInstanceId: cardInstance.instanceId,
            targetIds,
          });
        }
      }
    }
  }

  if (isMainPhase(game.phase) && game.stack.length === 0) {
    for (const cardInstance of player.hand) {
      if (isCreature(cardInstance) && canPayManaCost(player.manaPool, cardInstance.card.manaCost)) {
        actions.push({
          type: "playCreature",
          playerId,
          cardInstanceId: cardInstance.instanceId,
        });
      } else if (!isCreature(cardInstance) && canPayFullSpellCost(player, cardInstance)) {
        for (const targetIds of getSpellTargetOptions(game, playerId, cardInstance.card)) {
          actions.push({
            type: "castSpell",
            playerId,
            cardInstanceId: cardInstance.instanceId,
            targetIds,
          });
        }
      }
    }
  }

  actions.push({
    type: "pass",
    playerId,
  });

  return actions;
}

function payAdditionalDiscardCost(game: GameState, player: PlayerState, source: CardInstance): void {
  if (!requiresAdditionalDiscard(source.card)) {
    return;
  }

  const discarded = player.hand.shift();

  if (!discarded) {
    throw new Error(`${player.playerId} cannot pay discard additional cost for ${source.card.name}.`);
  }

  player.graveyard.push(discarded);
  game.log.push({
    turn: game.turnNumber,
    phase: game.phase,
    message: `${player.playerId} discards ${discarded.card.name} to cast ${source.card.name}.`,
  });
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
    if (legalAction.type === "playCreature" && action.type === "playCreature") {
      return legalAction.cardInstanceId === action.cardInstanceId;
    }
    if (legalAction.type === "castSpell" && action.type === "castSpell") {
      return (
        legalAction.cardInstanceId === action.cardInstanceId &&
        legalAction.targetIds.length === action.targetIds.length &&
        legalAction.targetIds.every((targetId, index) => targetId === action.targetIds[index])
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
  const card = removeFromHand(player, action.cardInstanceId);
  player.manaPool = spendManaCost(player.manaPool, `${card.card.manaCost}${getAdditionalManaCost(card.card)}`);
  payAdditionalDiscardCost(game, player, card);
  if (action.type === "playCreature") {
    pushCreatureSpell(game, player, card);
  } else {
    game.stack.push({
      id: `stack:${game.turnNumber}:${game.stack.length + 1}:${card.instanceId}`,
      controllerId: player.playerId,
      source: card,
      kind: "nonCreatureSpell",
      targetIds: action.targetIds,
    });
  }

  game.log.push({
    turn: game.turnNumber,
    phase: game.phase,
    message: `${player.playerId} casts ${card.card.name}.`,
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
    stackItem.source.enteredTurn = game.turnNumber;
    stackItem.source.tapped = false;
    stackItem.source.damageMarked = 0;
    stackItem.source.deathtouchDamageMarked = 0;
    stackItem.source.powerModifier = 0;
    stackItem.source.toughnessModifier = 0;
    stackItem.source.staticPowerModifier = 0;
    stackItem.source.staticToughnessModifier = 0;
    stackItem.source.basePowerOverride = null;
    stackItem.source.baseToughnessOverride = null;
    stackItem.source.staticKeywords = [];
    stackItem.source.temporaryKeywords = [];
    stackItem.source.losesAbilities = false;
    stackItem.source.cannotAttack = false;
    stackItem.source.cannotDefend = false;
    stackItem.source.attachedToId = null;
    stackItem.source.doesNotUntap = false;
    controller.battlefield.push(stackItem.source);

    game.log.push({
      turn: game.turnNumber,
      phase: game.phase,
      message: `${stackItem.source.card.name} resolves onto ${controller.playerId}'s battlefield.`,
    });
  } else {
    resolveNonCreatureSpell(game, stackItem);
  }

  assertGameStateIsValid(game, `after resolving ${stackItem.source.card.name}`);
}
