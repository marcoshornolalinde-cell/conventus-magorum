import { getPlayer } from "../core/actions.js";
import { getActivatedAbilityProfile } from "../core/activatedAbilities.js";
import { getEffectiveManaCost } from "../core/costs.js";
import { addMana, canPayManaCost } from "../core/mana.js";
import {
  chooseCombatPlanWithPolicy,
  chooseScoredAction,
  defaultAiPolicyWeights,
  type AiPolicyWeights,
} from "./policy.js";
import type { CombatPlan, GameState, LegalAction, ManaPool, PlayerId, PlayerState } from "../core/types.js";

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

export function chooseActionWithPolicy(
  game: GameState,
  playerId: PlayerId,
  legalActions: LegalAction[],
  weights: AiPolicyWeights = defaultAiPolicyWeights,
): LegalAction {
  const scoredAction = chooseScoredAction(game, playerId, legalActions, weights);

  if (scoredAction) {
    return scoredAction.action;
  }

  const manaAction = legalActions.find((action) => action.type === "activateManaAbility");
  if (manaAction && couldUseMoreMana(game, playerId, legalActions)) {
    return manaAction;
  }

  return legalActions.find((action) => action.type === "pass") ?? legalActions[0];
}

export function chooseFirstPlayableCreature(
  game: GameState,
  playerId: PlayerId,
  legalActions: LegalAction[],
): LegalAction {
  return chooseActionWithPolicy(game, playerId, legalActions);
}

export function chooseBasicCombatPlan(game: GameState, playerId: PlayerId): CombatPlan {
  return chooseCombatPlanWithPolicy(game, playerId);
}
