import { describe, expect, it } from "vitest";

import { parseAiPolicyWeights } from "../src/ai/model.js";

describe("AI model loading", () => {
  it("reads weights from a trained model payload", () => {
    const weights = parseAiPolicyWeights({
      schemaVersion: 1,
      best: {
        weights: {
          spellPlayWeight: 12,
          lethalDetectionWeight: 140,
        },
      },
    });

    expect(weights.spellPlayWeight).toBe(12);
    expect(weights.lethalDetectionWeight).toBe(140);
    expect(weights.creaturePlayWeight).toBeGreaterThan(0);
  });

  it("reads weights from a compact weights payload", () => {
    const weights = parseAiPolicyWeights({
      weights: {
        attackRiskWeight: 3.5,
      },
    });

    expect(weights.attackRiskWeight).toBe(3.5);
    expect(weights.spellPlayWeight).toBeGreaterThan(0);
  });

  it("rejects invalid weight values", () => {
    expect(() => parseAiPolicyWeights({ weights: { spellPlayWeight: "fast" } })).toThrow(
      /spellPlayWeight/,
    );
  });
});
