import { getPlayer } from "../core/actions.js";
import { getActivatedAbilityProfile } from "../core/activatedAbilities.js";
import { canAttack, canDefend, getCreaturesOnBattlefield, getCreatureStats } from "../core/combat.js";
import { getEffectiveManaCost } from "../core/costs.js";
import { addMana, canPayManaCost } from "../core/mana.js";
import type { CardInstance, CombatPlan, GameState, LegalAction, ManaPool, PlayerId, PlayerState } from "../core/types.js";

function findPermanentController(game: GameState, instanceId: string): PlayerState | null {
  return game.players.find((player) => player.battlefield.some((permanent) => permanent.instanceId === instanceId)) ?? null;
}

function findPermanent(game: GameState, instanceId: string): CardInstance | null {
  return findPermanentController(game, instanceId)?.battlefield.find((permanent) => permanent.instanceId === instanceId) ?? null;
}

function isOwnPermanent(game: GameState, playerId: PlayerId, instanceId: string): boolean {
  return findPermanentController(game, instanceId)?.playerId === playerId;
}

function hasAttackedThisTurn(game: GameState, playerId: PlayerId, instanceId: string): boolean {
  return game.events.some(
    (event) =>
      event.turn === game.turnNumber &&
      event.type === "creatureAttacked" &&
      event.playerId === playerId &&
      event.sourceId === instanceId,
  );
}

function countAttackersThisTurn(game: GameState, playerId: PlayerId): number {
  return game.events.filter(
    (event) => event.turn === game.turnNumber && event.type === "creatureAttacked" && event.playerId === playerId,
  ).length;
}

function canEventuallyPayRelevantActivatedAbility(
  game: GameState,
  player: PlayerState,
  currentPool: ManaPool,
  potentialPool: ManaPool,
): boolean {
  const sources = [...player.battlefield, ...player.graveyard];

  return sources.some((source) => {
    const profile = getActivatedAbilityProfile(source.card);

    if (!profile?.cost.manaCost || !canPayManaCost(potentialPool, profile.cost.manaCost)) {
      return false;
    }

    if (canPayManaCost(currentPool, profile.cost.manaCost)) {
      return false;
    }

    if (profile.sourceZone === "battlefield" && !player.battlefield.some((permanent) => permanent.instanceId === source.instanceId)) {
      return false;
    }

    if (profile.sourceZone === "graveyard" && !player.graveyard.some((card) => card.instanceId === source.instanceId)) {
      return false;
    }

    if (profile.cost.tap && source.tapped) {
      return false;
    }

    if (game.phase === "combat") {
      return /attacking|pump|unblockable|flying|destroy|draw|drain/i.test(profile.id);
    }

    return /draw|drain|destroy|transform|sacrifice_counter|return_tapped|create_zombies/i.test(profile.id);
  });
}

function couldUseMoreMana(game: GameState, playerId: PlayerId, legalActions: LegalAction[]): boolean {
  const player = getPlayer(game, playerId);
  const manaActions = legalActions.filter((action) => action.type === "activateManaAbility");

  if (manaActions.length === 0) {
    return false;
  }

  let potentialPool = { ...player.manaPool };
  for (const action of manaActions) {
    potentialPool = addMana(potentialPool, action.mana, action.amount);
  }

  const candidateCards = game.stack.length > 0
    ? player.hand.filter((card) => /Counter target spell/i.test(card.card.gameText))
    : player.hand;

  return (
    candidateCards.some((card) => canPayManaCost(potentialPool, getEffectiveManaCost(player, card))) ||
    canEventuallyPayRelevantActivatedAbility(game, player, player.manaPool, potentialPool)
  );
}

function scoreActivatedAction(game: GameState, playerId: PlayerId, action: Extract<LegalAction, { type: "activateAbility" }>): number {
  const abilityId = action.abilityId;
  const targetId = action.targetIds[0];
  const target = targetId ? findPermanent(game, targetId) : null;
  const targetIsOurs = targetId ? isOwnPermanent(game, playerId, targetId) : false;
  const targetIsAttacking = targetId ? hasAttackedThisTurn(game, playerId, targetId) : false;
  const attackerCount = countAttackersThisTurn(game, playerId);

  if (/destroy/i.test(abilityId)) {
    return targetId && !targetIsOurs ? 120 : -30;
  }

  if (/attacking_pump/i.test(abilityId)) {
    return attackerCount > 0 ? 85 + attackerCount * 10 : 0;
  }

  if (/attacking_counter/i.test(abilityId)) {
    return targetIsOurs && targetIsAttacking ? 100 : 15;
  }

  if (/unblockable/i.test(abilityId)) {
    return target && targetIsOurs && canAttack(target, game.turnNumber) ? 90 : 25;
  }

  if (/flying_sacrifice/i.test(abilityId)) {
    return target && targetIsOurs && canAttack(target, game.turnNumber) ? 80 : 20;
  }

  if (/pump/i.test(abilityId)) {
    if (targetIsOurs && targetIsAttacking) return 90;
    if (targetIsOurs) return 60;
    return -20;
  }

  if (/draw/i.test(abilityId)) {
    return game.phase === "combat" ? 15 : 45;
  }

  if (/drain/i.test(abilityId)) {
    return 50;
  }

  if (/transform/i.test(abilityId)) {
    return 55;
  }

  if (/sacrifice_counter|return_tapped|create_zombies/i.test(abilityId)) {
    return 40;
  }

  return 0;
}

export function chooseFirstPlayableCreature(
  game: GameState,
  playerId: PlayerId,
  legalActions: LegalAction[],
): LegalAction {
  const player = getPlayer(game, playerId);
  const spellActions = legalActions.filter((action) => action.type === "castSpell");
  const scoredSpellActions = spellActions
    .map((action) => {
      const card = player.hand.find((instance) => instance.instanceId === action.cardInstanceId)?.card;
      const text = card?.gameText ?? "";
      let score = 0;

      if (/Destroy target creature|Exile target creature|deals \d+ damage to target .*creature|gets -\d+\/-\d+/i.test(text)) {
        score = 100;
      } else if (game.stack.length > 0 && /Counter target spell/i.test(text)) {
        score = 95;
      } else if (/gets \+\d+\/\+\d+|gains? (first strike|deathtouch|indestructible|trample|lifelink)/i.test(text)) {
        score = 60;
      } else if (/Draw/i.test(text)) {
        score = 20;
      }

      return { action, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((first, second) => second.score - first.score);

  if (scoredSpellActions[0]) {
    return scoredSpellActions[0].action;
  }

  const activatedActions = legalActions.filter((action) => action.type === "activateAbility");
  const scoredActivatedActions = activatedActions
    .map((action) => ({ action, score: scoreActivatedAction(game, playerId, action) }))
    .filter((entry) => entry.score > 0)
    .sort((first, second) => second.score - first.score);

  if (scoredActivatedActions[0] && scoredActivatedActions[0].score >= 80) {
    return scoredActivatedActions[0].action;
  }

  const creatureAction = legalActions.find((action) => action.type === "playCreature");
  if (creatureAction) {
    return creatureAction;
  }

  if (scoredActivatedActions[0]) {
    return scoredActivatedActions[0].action;
  }

  const manaAction = legalActions.find((action) => action.type === "activateManaAbility");
  if (manaAction && couldUseMoreMana(game, playerId, legalActions)) {
    return manaAction;
  }

  return legalActions.find((action) => action.type === "pass") ?? legalActions[0];
}

export function chooseBasicCombatPlan(game: GameState, playerId: PlayerId): CombatPlan {
  const creatures = getCreaturesOnBattlefield(getPlayer(game, playerId));
  const attackers = creatures
    .filter((creature) => canAttack(creature, game.turnNumber))
    .filter((creature) => {
      const stats = getCreatureStats(creature);
      return stats.power >= 2 || stats.power >= stats.toughness;
    });
  const attackerIds = new Set(attackers.map((creature) => creature.instanceId));
  const defenderIds = creatures
    .filter((creature) => canDefend(creature))
    .filter((creature) => !attackerIds.has(creature.instanceId))
    .map((creature) => creature.instanceId);

  return {
    playerId,
    attackerIds: [...attackerIds],
    defenderIds,
  };
}
