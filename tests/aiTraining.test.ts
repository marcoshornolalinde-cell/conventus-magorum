import { describe, expect, it } from "vitest";

import { trainAiPolicy } from "../src/ai/train.js";
import type { ContentBundle } from "../src/core/types.js";
import { loadContentBundle } from "../src/data/loadContent.js";

const content: ContentBundle = loadContentBundle();

describe("AI training", () => {
  it("evaluates the base model and at least one mutated policy with validation holdout", () => {
    const result = trainAiPolicy(content, {
      seed: "ai-training-test",
      minutes: 0.001,
      gamesPerCandidate: 2,
      validationGamesPerCandidate: 2,
      validationMinScoreDelta: 0.01,
      candidatesPerGeneration: 1,
      maxTurns: 12,
      mutationRate: 0.05,
    });

    expect(result.baseline.evaluation.games).toBe(2);
    expect(result.baseline.validationEvaluation?.games).toBe(2);
    expect(result.evaluatedCandidates).toBeGreaterThanOrEqual(1);
    expect(result.history.length).toBe(result.evaluatedCandidates);
    expect(result.best.validationEvaluation?.games).toBe(2);
  });
});
