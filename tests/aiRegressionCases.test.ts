import { describe, expect, it } from "vitest";

import { chooseCombatPlanWithPolicy, scoreLegalAction } from "../src/ai/policy.js";
import { getLegalActions } from "../src/core/actions.js";
import { hasKeyword } from "../src/core/combat.js";
import { createInitialGame, type InitialPlayerConfig } from "../src/core/gameState.js";
import type { CardInstance, CombatPairing, ContentBundle, PlayerId, PlayerState } from "../src/core/types.js";
import { loadContentBundle } from "../src/data/loadContent.js";

const content: ContentBundle = loadContentBundle();

function createGame(seed: string, players: [InitialPlayerConfig, InitialPlayerConfig]) {
  return createInitialGame(content, { seed, players });
}

function resetInstance(instance: CardInstance): CardInstance {
  instance.tapped = false;
  instance.damageMarked = 0;
  instance.deathtouchDamageMarked = 0;
  instance.powerModifier = 0;
  instance.toughnessModifier = 0;
  instance.staticPowerModifier = 0;
  instance.staticToughnessModifier = 0;
  instance.basePowerOverride = null;
  instance.baseToughnessOverride = null;
  instance.plusOneCounters = 0;
  instance.staticKeywords = [];
  instance.temporaryKeywords = [];
  instance.additionalSubtypes = [];
  instance.losesAbilities = false;
  instance.cannotAttack = false;
  instance.cannotDefend = false;
  instance.temporaryCannotDefend = false;
  instance.attachedToId = null;
  instance.doesNotUntap = false;
  instance.enteredTurn = 0;
  instance.activatedAbilityIdsUsed = [];
  return instance;
}

function removeFromZones(player: PlayerState, instanceId: string): void {
  player.spellDeck = player.spellDeck.filter((instance) => instance.instanceId !== instanceId);
  player.landDeck = player.landDeck.filter((instance) => instance.instanceId !== instanceId);
  player.hand = player.hand.filter((instance) => instance.instanceId !== instanceId);
  player.battlefield = player.battlefield.filter((instance) => instance.instanceId !== instanceId);
  player.graveyard = player.graveyard.filter((instance) => instance.instanceId !== instanceId);
  player.exile = player.exile.filter((instance) => instance.instanceId !== instanceId);
}

function findCard(player: PlayerState, cardId: string): CardInstance {
  const instance = player.pool.find((candidate) => candidate.card.id === cardId);

  if (!instance) {
    throw new Error(`Missing regression card ${cardId}.`);
  }

  removeFromZones(player, instance.instanceId);
  return resetInstance(instance);
}

function setCombatPairing(game: ReturnType<typeof createGame>, attacker: CardInstance, blocker: CardInstance, defendingPlayerId: PlayerId): void {
  game.phase = "combat";
  game.currentCombatPairings = [{
    attackerId: attacker.instanceId,
    defenderIds: [blocker.instanceId],
    defendingPlayerId,
  } satisfies CombatPairing];
}

describe("AI regression cases", () => {
  it("does not spend combat tricks before blockers/pairings are known", () => {
    const game = createGame("regression-hold-trick", [
      { id: "player1", archetypeIds: ["cats", "vampires"] },
      { id: "player2", archetypeIds: ["elves", "primal"] },
    ]);
    const player = game.players[0];
    const trick = findCard(player, "moment_of_triumph");
    const creature = findCard(player, "savannah_lions");

    game.phase = "combat";
    player.hand = [trick];
    player.battlefield = [creature];
    game.currentCombatPairings = [];

    const features = scoreLegalAction(game, player.playerId, {
      type: "castSpell",
      playerId: player.playerId,
      cardInstanceId: trick.instanceId,
      targetIds: [creature.instanceId],
      additionalCosts: [],
    });

    expect(features.score).toBeLessThan(0);
  });

  it("uses combat tricks when they improve a real combat exchange", () => {
    const game = createGame("regression-use-trick", [
      { id: "player1", archetypeIds: ["cats", "vampires"] },
      { id: "player2", archetypeIds: ["elves", "primal"] },
    ]);
    const player = game.players[0];
    const opponent = game.players[1];
    const trick = findCard(player, "moment_of_triumph");
    const attacker = findCard(player, "savannah_lions");
    const blocker = findCard(opponent, "bear_cub");

    player.hand = [trick];
    player.battlefield = [attacker];
    opponent.battlefield = [blocker];
    setCombatPairing(game, attacker, blocker, opponent.playerId);

    const features = scoreLegalAction(game, player.playerId, {
      type: "castSpell",
      playerId: player.playerId,
      cardInstanceId: trick.instanceId,
      targetIds: [attacker.instanceId],
      additionalCosts: [],
    });

    expect(features.score).toBeGreaterThan(0);
  });

  it("keeps a blocker when crackback can kill us", () => {
    const game = createGame("regression-crackback", [
      { id: "player1", archetypeIds: ["wizards", "pirates"] },
      { id: "player2", archetypeIds: ["cats", "goblins"] },
    ]);
    const player = game.players[0];
    const opponent = game.players[1];
    const defender = findCard(player, "brineborn_cutthroat");
    const firstAttacker = findCard(opponent, "savannah_lions");
    const secondAttacker = findCard(opponent, "raging_redcap");

    game.turnNumber = 6;
    player.lifeTotal = 4;
    player.battlefield = [defender];
    opponent.battlefield = [firstAttacker, secondAttacker];

    const plan = chooseCombatPlanWithPolicy(game, player.playerId);

    expect(plan.attackerIds).not.toContain(defender.instanceId);
    expect(plan.defenderIds).toContain(defender.instanceId);
  });

  it("still enables safe evasive attacks before combat positioning", () => {
    const game = createGame("regression-safe-evasion", [
      { id: "player1", archetypeIds: ["goblins", "inferno"] },
      { id: "player2", archetypeIds: ["cats", "healing"] },
    ]);
    const player = game.players[0];
    const opponent = game.players[1];
    const smuggler = findCard(player, "goblin_smuggler");
    const attacker = findCard(player, "swab_goblin");
    const blocker = findCard(opponent, "savannah_lions");

    game.phase = "combat";
    game.turnNumber = 6;
    player.battlefield = [smuggler, attacker];
    opponent.battlefield = [blocker];

    const action = getLegalActions(game, player.playerId)
      .filter((candidate) => candidate.type === "activateAbility")
      .map((candidate) => ({ action: candidate, score: scoreLegalAction(game, player.playerId, candidate).score }))
      .sort((first, second) => second.score - first.score)[0];

    expect(action.action).toMatchObject({
      type: "activateAbility",
      abilityId: "goblin_smuggler:unblockable",
      targetIds: [attacker.instanceId],
    });
    expect(action.score).toBeGreaterThan(0);
    expect(hasKeyword(attacker, "Unblockable")).toBe(false);
  });
});
