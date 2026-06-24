import { describe, expect, it } from "vitest";

import { createInitialGame } from "../src/core/gameState.js";
import type { ContentBundle } from "../src/core/types.js";
import { createPlayerDecks } from "../src/data/buildDecks.js";
import { loadContentBundle } from "../src/data/loadContent.js";
import { validateContentBundle } from "../src/data/validateContent.js";

const content: ContentBundle = loadContentBundle();

describe("content bundle", () => {
  it("loads data from data/content_bundle.json", () => {
    expect(content.schemaVersion).toBe(1);
    expect(content.cards.length).toBeGreaterThan(0);
    expect(content.archetypes.length).toBeGreaterThan(0);
    expect(validateContentBundle(content)).toEqual({
      valid: true,
      errors: [],
      warnings: [],
    });
  });

  it("has 10 archetypes", () => {
    expect(content.archetypes).toHaveLength(10);
  });

  it("has 20 cards in each archetype", () => {
    for (const archetype of content.archetypes) {
      const totalCards = archetype.cards.reduce((total, card) => total + card.quantity, 0);

      expect(archetype.cardCount).toBe(20);
      expect(totalCards).toBe(20);
    }
  });
});

describe("player decks", () => {
  it("creates a 40-card pool from 2 archetypes", () => {
    const decks = createPlayerDecks(content, "player1", ["cats", "vampires"], "test-seed");

    expect(decks.archetypeIds).toEqual(["cats", "vampires"]);
    expect(decks.pool).toHaveLength(40);
    expect(new Set(decks.pool.map((instance) => instance.sourceArchetypeId))).toEqual(new Set(["cats", "vampires"]));
  });

  it("separates lands and spells", () => {
    const decks = createPlayerDecks(content, "player1", ["cats", "vampires"], "test-seed");

    expect(decks.landDeck).toHaveLength(16);
    expect(decks.spellDeck).toHaveLength(24);
    expect(decks.landDeck.every((instance) => instance.card.isLand)).toBe(true);
    expect(decks.spellDeck.every((instance) => !instance.card.isLand)).toBe(true);
    expect(decks.landDeck.length + decks.spellDeck.length).toBe(decks.pool.length);
  });

  it("shuffles decks reproducibly from the seed", () => {
    const firstBuild = createPlayerDecks(content, "player1", ["cats", "vampires"], "same-seed");
    const secondBuild = createPlayerDecks(content, "player1", ["cats", "vampires"], "same-seed");
    const differentBuild = createPlayerDecks(content, "player1", ["cats", "vampires"], "other-seed");

    expect(firstBuild.spellDeck.map((instance) => instance.instanceId)).toEqual(
      secondBuild.spellDeck.map((instance) => instance.instanceId),
    );
    expect(firstBuild.landDeck.map((instance) => instance.instanceId)).toEqual(
      secondBuild.landDeck.map((instance) => instance.instanceId),
    );
    expect(firstBuild.spellDeck.map((instance) => instance.instanceId)).not.toEqual(
      differentBuild.spellDeck.map((instance) => instance.instanceId),
    );
  });
});

describe("initial game", () => {
  it("draws an initial 4-card hand from each spell deck", () => {
    const game = createInitialGame(content, {
      seed: "opening-hand",
      players: [
        { id: "player1", archetypeIds: ["cats", "vampires"] },
        { id: "player2", archetypeIds: ["healing", "pirates"] },
      ],
    });

    expect(game.players).toHaveLength(2);

    for (const player of game.players) {
      const expectedSpellCount = player.pool.filter((instance) => !instance.card.isLand).length;

      expect(player.pool).toHaveLength(40);
      expect(player.hand).toHaveLength(4);
      expect(player.hand.every((instance) => !instance.card.isLand)).toBe(true);
      expect(player.spellDeck).toHaveLength(expectedSpellCount - 4);
      expect(player.landDeck.every((instance) => instance.card.isLand)).toBe(true);
    }
  });
});
