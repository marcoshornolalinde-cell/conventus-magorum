import { describe, expect, it } from "vitest";

import { analyzeAiStrategy, analyzeDeckStrategy } from "../src/ai/strategy.js";
import { createInitialGame } from "../src/core/gameState.js";
import type { CardInstance, ContentBundle, PlayerState } from "../src/core/types.js";
import { loadContentBundle } from "../src/data/loadContent.js";

const content: ContentBundle = loadContentBundle();

function createGame(playerArchetypes: [string, string], opponentArchetypes: [string, string], seed: string) {
  return createInitialGame(content, {
    seed,
    players: [
      { id: "player1", archetypeIds: playerArchetypes },
      { id: "player2", archetypeIds: opponentArchetypes },
    ],
  });
}

function findCreature(player: PlayerState, minimumPower = 1): CardInstance {
  const creature = player.pool.find(
    (candidate) =>
      candidate.card.cardTypes.includes("Creature") &&
      (Number.parseInt(candidate.card.power ?? "0", 10) || 0) >= minimumPower,
  );

  if (!creature) {
    throw new Error(`No creature with power ${minimumPower} found for ${player.playerId}.`);
  }

  return {
    ...creature,
    tapped: false,
    enteredTurn: -1,
    damageMarked: 0,
    deathtouchDamageMarked: 0,
  };
}

describe("AI strategy", () => {
  it("extracts strategic signals from real decks", () => {
    const aggroGame = createGame(["cats", "goblins"], ["healing", "pirates"], "strategy-aggro");
    const controlGame = createGame(["wizards", "pirates"], ["cats", "goblins"], "strategy-control");
    const tempoGame = createGame(["elves", "primal"], ["healing", "pirates"], "strategy-tempo");

    const aggro = analyzeDeckStrategy(aggroGame.players[0]);
    const control = analyzeDeckStrategy(controlGame.players[0]);
    const tempo = analyzeDeckStrategy(tempoGame.players[0]);

    expect(aggro.metrics.cheapCreatureCount).toBeGreaterThan(0);
    expect(aggro.metrics.aggroScore).toBeGreaterThan(aggro.metrics.controlScore);
    expect(aggro.confidence).toBeGreaterThan(0);
    expect(control.metrics.removalCount + control.metrics.cardAdvantageCount).toBeGreaterThan(0);
    expect(control.metrics.controlScore).toBeGreaterThan(aggro.metrics.controlScore);
    expect(tempo.metrics.manaDevelopmentCount + tempo.metrics.bigThreatCount).toBeGreaterThan(0);
    expect(tempo.metrics.tempoScore).toBeGreaterThan(tempo.metrics.controlScore);
  });

  it("moves into a racing posture when board pressure can end the game", () => {
    const game = createGame(["cats", "goblins"], ["healing", "pirates"], "strategy-race");
    const player = game.players[0];
    const opponent = game.players[1];

    player.battlefield = [findCreature(player, 3), findCreature(player, 2)];
    opponent.battlefield = [];
    opponent.lifeTotal = 4;

    const profile = analyzeAiStrategy(game, player.playerId);

    expect(profile.posture).toBe("race");
    expect(profile.strategicConfidence).toBeGreaterThanOrEqual(0);
    expect(profile.raceScore).toBeGreaterThan(0);
  });

  it("assigns a dynamic matchup role in addition to deck identity", () => {
    const aggroGame = createGame(["cats", "goblins"], ["wizards", "pirates"], "strategy-role-aggro");
    const controlGame = createGame(["wizards", "pirates"], ["cats", "goblins"], "strategy-role-control");

    const aggroProfile = analyzeAiStrategy(aggroGame, aggroGame.players[0].playerId);
    const controlProfile = analyzeAiStrategy(controlGame, controlGame.players[0].playerId);

    expect(aggroProfile.matchupRole).toBe("beatdown");
    expect(aggroProfile.matchupRoleConfidence).toBeGreaterThan(0);
    expect(controlProfile.matchupRole).not.toBe("beatdown");
  });

  it("moves into a stabilizing posture when behind on board and life", () => {
    const game = createGame(["wizards", "pirates"], ["cats", "goblins"], "strategy-stabilize");
    const player = game.players[0];
    const opponent = game.players[1];

    player.lifeTotal = 6;
    player.battlefield = [];
    opponent.battlefield = [findCreature(opponent, 3), findCreature(opponent, 2)];

    const profile = analyzeAiStrategy(game, player.playerId);

    expect(profile.posture).toBe("stabilize");
    expect(profile.boardPowerDelta).toBeLessThan(0);
  });
});
