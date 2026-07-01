import { describe, expect, it } from "vitest";

import { auditAiGames } from "../src/ai/audit.js";
import { chooseCombatPlanWithPolicy, defaultAiPolicyWeights, getSpellIntentTags, scoreLegalAction } from "../src/ai/policy.js";
import { createInitialGame } from "../src/core/gameState.js";
import type { Card, CardInstance, ContentBundle, PlayerState } from "../src/core/types.js";
import { loadContentBundle } from "../src/data/loadContent.js";

const content: ContentBundle = loadContentBundle();

function getCard(cardId: string): Card {
  const card = content.cards.find((candidate) => candidate.id === cardId);

  if (!card) {
    throw new Error(`Missing test card ${cardId}.`);
  }

  return card;
}

function findPoolCard(player: PlayerState, cardId: string): CardInstance {
  const source = player.pool.find((instance) => instance.card.id === cardId);

  if (!source) {
    throw new Error(`Missing test card ${cardId}.`);
  }

  return {
    ...source,
    instanceId: `${source.instanceId}:ai-policy-test`,
    tapped: false,
    damageMarked: 0,
    deathtouchDamageMarked: 0,
    powerModifier: 0,
    toughnessModifier: 0,
    staticPowerModifier: 0,
    staticToughnessModifier: 0,
    basePowerOverride: null,
    baseToughnessOverride: null,
    plusOneCounters: 0,
    staticKeywords: [],
    temporaryKeywords: [],
    losesAbilities: false,
    cannotAttack: false,
    cannotDefend: false,
    temporaryCannotDefend: false,
    attachedToId: null,
    doesNotUntap: false,
    enteredTurn: 0,
    activatedAbilityIdsUsed: [],
  };
}

describe("AI policy", () => {
  it("classifies spell intent tags for training features", () => {
    expect(getSpellIntentTags(getCard("heros_downfall"))).toContain("removal");
    expect(getSpellIntentTags(getCard("moment_of_triumph"))).toEqual(
      expect.arrayContaining(["pump", "combatTrick", "lifeGain"]),
    );
    expect(getSpellIntentTags(getCard("dragon_fodder"))).toContain("tokens");
    expect(getSpellIntentTags(getCard("opt"))).toEqual(expect.arrayContaining(["cardDraw", "cardSelection"]));
  });

  it("exposes tunable policy weights for later ML/evolution runs", () => {
    expect(Object.keys(defaultAiPolicyWeights)).toEqual(
      expect.arrayContaining([
        "spellPlayWeight",
        "removalTargetThreatWeight",
        "combatTrickHoldWeight",
        "attackRiskWeight",
        "activatedDrawWeight",
      ]),
    );
  });

  it("prioritizes combat tricks only when they change a known combat pairing", () => {
    const game = createInitialGame(content, {
      seed: "ai-combat-trick-impact",
      players: [
        { id: "player1", archetypeIds: ["cats", "vampires"] },
        { id: "player2", archetypeIds: ["elves", "primal"] },
      ],
    });
    const player = game.players[0];
    const opponent = game.players[1];
    const trick = findPoolCard(player, "moment_of_triumph");
    const attacker = findPoolCard(player, "savannah_lions");
    const benchCreature = findPoolCard(player, "leonin_vanguard");
    const blocker = findPoolCard(opponent, "bear_cub");

    game.phase = "combat";
    player.hand = [trick];
    player.battlefield = [attacker, benchCreature];
    opponent.battlefield = [blocker];
    game.currentCombatPairings = [
      {
        attackerId: attacker.instanceId,
        defenderIds: [blocker.instanceId],
        defendingPlayerId: opponent.playerId,
      },
    ];

    const useful = scoreLegalAction(game, player.playerId, {
      type: "castSpell",
      playerId: player.playerId,
      cardInstanceId: trick.instanceId,
      targetIds: [attacker.instanceId],
      additionalCosts: [],
    });
    const irrelevant = scoreLegalAction(game, player.playerId, {
      type: "castSpell",
      playerId: player.playerId,
      cardInstanceId: trick.instanceId,
      targetIds: [benchCreature.instanceId],
      additionalCosts: [],
    });

    expect(useful.score).toBeGreaterThan(0);
    expect(irrelevant.score).toBeLessThan(0);
    expect(useful.score).toBeGreaterThan(irrelevant.score);
  });

  it("holds combat tricks before pairings are known", () => {
    const game = createInitialGame(content, {
      seed: "ai-combat-trick-held",
      players: [
        { id: "player1", archetypeIds: ["cats", "vampires"] },
        { id: "player2", archetypeIds: ["elves", "primal"] },
      ],
    });
    const player = game.players[0];
    const trick = findPoolCard(player, "moment_of_triumph");
    const attacker = findPoolCard(player, "savannah_lions");

    game.phase = "combat";
    player.hand = [trick];
    player.battlefield = [attacker];
    game.currentCombatPairings = [];

    const features = scoreLegalAction(game, player.playerId, {
      type: "castSpell",
      playerId: player.playerId,
      cardInstanceId: trick.instanceId,
      targetIds: [attacker.instanceId],
      additionalCosts: [],
    });

    expect(features.score).toBeLessThan(0);
  });

  it("keeps blockers back when crackback damage is dangerous", () => {
    const game = createInitialGame(content, {
      seed: "ai-crackback-risk",
      players: [
        { id: "player1", archetypeIds: ["wizards", "pirates"] },
        { id: "player2", archetypeIds: ["cats", "goblins"] },
      ],
    });
    const player = game.players[0];
    const opponent = game.players[1];
    const defender = findPoolCard(player, "brineborn_cutthroat");
    const firstAttacker = findPoolCard(opponent, "savannah_lions");
    const secondAttacker = findPoolCard(opponent, "raging_redcap");

    game.turnNumber = 6;
    player.lifeTotal = 4;
    defender.enteredTurn = 0;
    firstAttacker.enteredTurn = 0;
    secondAttacker.enteredTurn = 0;
    player.battlefield = [defender];
    opponent.battlefield = [firstAttacker, secondAttacker];

    const plan = chooseCombatPlanWithPolicy(game, player.playerId);

    expect(plan.attackerIds).not.toContain(defender.instanceId);
    expect(plan.defenderIds).toContain(defender.instanceId);
  });

  it("audits a small deterministic batch of AI games", () => {
    const report = auditAiGames(content, {
      games: 3,
      seed: "ai-policy-test",
      maxTurns: 20,
      sampleLimit: 50,
    });

    expect(report.games).toBe(3);
    expect(report.completedGames).toBe(3);
    expect(report.errors).toHaveLength(0);
    expect(report.tunableParameters).toContain("lethalDetectionWeight");
    expect(report.samples.length).toBeGreaterThan(0);
    expect(Object.values(report.actionCounts).reduce((total, count) => total + count, 0)).toBeGreaterThan(0);
  });
});
