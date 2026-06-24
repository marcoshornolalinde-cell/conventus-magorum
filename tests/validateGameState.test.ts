import { describe, expect, it } from "vitest";

import { createInitialGame } from "../src/core/gameState.js";
import { validateGameState } from "../src/core/validateGameState.js";
import type { ContentBundle } from "../src/core/types.js";
import { loadContentBundle } from "../src/data/loadContent.js";

const content: ContentBundle = loadContentBundle();

describe("validateGameState", () => {
  it("accepts a freshly created game", () => {
    const game = createInitialGame(content, { seed: "validator-ok" });

    expect(validateGameState(game)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("detects duplicate card instances across zones", () => {
    const game = createInitialGame(content, { seed: "validator-duplicate" });
    const card = game.players[0].hand[0];
    game.players[0].graveyard.push(card);

    const result = validateGameState(game);

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("appears in both"))).toBe(true);
  });

  it("detects missing cards from all zones and stack", () => {
    const game = createInitialGame(content, { seed: "validator-missing" });
    const missing = game.players[0].hand.shift();

    expect(missing).toBeDefined();

    const result = validateGameState(game);

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("missing from all zones and stack"))).toBe(true);
  });

  it("detects attachments pointing to a missing permanent", () => {
    const game = createInitialGame(content, { seed: "validator-attachment" });
    const permanent = game.players[0].hand[0];
    game.players[0].hand.shift();
    permanent.attachedToId = "missing-permanent";
    game.players[0].battlefield.push(permanent);

    const result = validateGameState(game);

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("attached to missing permanent"))).toBe(true);
  });
});
