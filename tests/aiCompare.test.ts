import { describe, expect, it } from "vitest";

import { resolveAiPolicyModel } from "../src/ai/model.js";
import type { ContentBundle } from "../src/core/types.js";
import { loadContentBundle } from "../src/data/loadContent.js";
import { compareAiPolicies } from "../src/simulate/compareAiPolicies.js";

const content: ContentBundle = loadContentBundle();

describe("AI policy comparison", () => {
  it("compares two policies head-to-head while alternating seats", () => {
    const result = compareAiPolicies(content, {
      games: 4,
      seed: "ai-compare-test",
      maxTurns: 12,
      modelA: resolveAiPolicyModel("base", "base-a"),
      modelB: resolveAiPolicyModel("base", "base-b"),
    });

    expect(result.games).toBe(4);
    expect(result.completedGames).toBe(4);
    expect(result.errors).toHaveLength(0);
    expect(result.stats).toHaveLength(2);
    expect(result.stats.reduce((total, row) => total + row.played, 0)).toBe(8);
    expect(result.seatStats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "base-a", playerId: "player1", played: 2 }),
        expect.objectContaining({ label: "base-a", playerId: "player2", played: 2 }),
        expect.objectContaining({ label: "base-b", playerId: "player1", played: 2 }),
        expect.objectContaining({ label: "base-b", playerId: "player2", played: 2 }),
      ]),
    );
    expect(result.archetypeStats.length).toBeGreaterThan(0);
  });
});
