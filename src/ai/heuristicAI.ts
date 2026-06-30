import { getPlayer } from "../core/actions.js";
import { canAttack, canDefend, getCreaturesOnBattlefield, getCreatureStats } from "../core/combat.js";
import { getEffectiveManaCost } from "../core/costs.js";
import { addMana, canPayManaCost } from "../core/mana.js";
import type { CombatPlan, GameState, LegalAction, PlayerId } from "../core/types.js";

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

  return candidateCards.some((card) => canPayManaCost(potentialPool, getEffectiveManaCost(player, card)));
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
  const destroyAbility = activatedActions.find((action) => /destroy/i.test(action.abilityId));
  if (destroyAbility) {
    return destroyAbility;
  }

  const creatureAction = legalActions.find((action) => action.type === "playCreature");
  if (creatureAction) {
    return creatureAction;
  }

  const valueAbility = activatedActions.find((action) =>
    /draw|drain|pump|transform|sacrifice_counter|return_tapped|create_zombies|unblockable/i.test(action.abilityId),
  );
  if (valueAbility) {
    return valueAbility;
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
