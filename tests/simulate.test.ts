import { describe, expect, it } from "vitest";

import type { ContentBundle } from "../src/core/types.js";
import { loadContentBundle } from "../src/data/loadContent.js";
import { runSimulation } from "../src/simulate/runSimulation.js";

const content: ContentBundle = loadContentBundle();

describe("simulation reporting", () => {
  it("runs a small archetype winrate report", () => {
    const result = runSimulation(content, {
      games: 10,
      seed: "small-simulation",
      maxTurns: 40,
    });

    expect(result.games).toBe(10);
    expect(result.completedGames).toBe(10);
    expect(result.errors).toHaveLength(0);
    expect(result.stats).toHaveLength(content.archetypes.length);
    expect(result.stats.reduce((total, row) => total + row.played, 0)).toBe(40);
    expect(result.pairStats.length).toBeGreaterThan(0);
    expect(result.pairStats.reduce((total, row) => total + row.played, 0)).toBe(20);
    expect(result.matchupMatrix.length).toBeGreaterThan(0);
    expect(result.matchupMatrix.reduce((total, row) => total + row.played, 0)).toBe(80);
    expect(result.damage.avgPlayerDamagePerGame).toBeGreaterThanOrEqual(0);
    expect(result.mostPlayedCards.length).toBeGreaterThan(0);
    expect(result.allHandEndCards.length).toBeGreaterThan(0);
  });
});
