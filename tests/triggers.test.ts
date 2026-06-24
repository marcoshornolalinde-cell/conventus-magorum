import { describe, expect, it } from "vitest";

import { getLegalActions, performAction, resolveTopOfStack } from "../src/core/actions.js";
import { createInitialGame } from "../src/core/gameState.js";
import { getCreatureStats } from "../src/core/combat.js";
import { getTriggeredAbilityProfiles } from "../src/core/triggerEngine.js";
import type { CardInstance, ContentBundle, PlayerState } from "../src/core/types.js";
import { loadContentBundle } from "../src/data/loadContent.js";

const content: ContentBundle = loadContentBundle();

function removeFromCurrentZones(player: PlayerState, instanceId: string): void {
  player.spellDeck = player.spellDeck.filter((instance) => instance.instanceId !== instanceId);
  player.landDeck = player.landDeck.filter((instance) => instance.instanceId !== instanceId);
  player.hand = player.hand.filter((instance) => instance.instanceId !== instanceId);
  player.battlefield = player.battlefield.filter((instance) => instance.instanceId !== instanceId);
  player.graveyard = player.graveyard.filter((instance) => instance.instanceId !== instanceId);
  player.exile = player.exile.filter((instance) => instance.instanceId !== instanceId);
}

function resetInstance(instance: CardInstance): void {
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
  instance.losesAbilities = false;
  instance.cannotAttack = false;
  instance.cannotDefend = false;
  instance.attachedToId = null;
  instance.doesNotUntap = false;
  instance.enteredTurn = 0;
}

function findPoolCard(player: PlayerState, cardId: string): CardInstance {
  const source = player.pool.find((instance) => instance.card.id === cardId);

  if (!source) {
    throw new Error(`Missing test card ${cardId}.`);
  }

  removeFromCurrentZones(player, source.instanceId);
  resetInstance(source);
  return source;
}

function setHand(player: PlayerState, cards: CardInstance[]): void {
  const testCardIds = new Set(cards.map((card) => card.instanceId));
  player.graveyard.push(...player.hand.filter((card) => !testCardIds.has(card.instanceId)));
  player.hand = [...cards];
}

function giveMana(player: PlayerState, color: "W" | "U" | "B" | "R" | "G" | "C", amount: number): void {
  player.manaPool[color] = amount;
}

describe("trigger engine", () => {
  it("parses supported triggered ability profiles from card text", () => {
    const helpfulHunter = content.cards.find((card) => card.id === "helpful_hunter");
    const ajanisPridemate = content.cards.find((card) => card.id === "ajanis_pridemate");

    expect(helpfulHunter).toBeDefined();
    expect(ajanisPridemate).toBeDefined();
    expect(getTriggeredAbilityProfiles(helpfulHunter!)).toHaveLength(1);
    expect(getTriggeredAbilityProfiles(ajanisPridemate!)).toHaveLength(1);
  });

  it("resolves a self-enter trigger that draws a card", () => {
    const game = createInitialGame(content, {
      seed: "trigger-draw",
      players: [
        { id: "player1", archetypeIds: ["cats", "vampires"] },
        { id: "player2", archetypeIds: ["healing", "pirates"] },
      ],
    });
    const player = game.players[0];
    const helpfulHunter = findPoolCard(player, "helpful_hunter");
    setHand(player, [helpfulHunter]);
    giveMana(player, "W", 3);
    game.phase = "main1";

    const action = getLegalActions(game, player.playerId).find((candidate) => candidate.type === "playCreature");
    performAction(game, action!);
    resolveTopOfStack(game);

    expect(player.battlefield.map((instance) => instance.instanceId)).toContain(helpfulHunter.instanceId);
    expect(player.hand).toHaveLength(1);
    expect(game.events.map((event) => event.type)).toEqual(expect.arrayContaining(["creatureEntered", "cardDrawn"]));
  });

  it("chains enter, life gain, and life-gain counter triggers through events", () => {
    const game = createInitialGame(content, {
      seed: "trigger-chain",
      players: [
        { id: "player1", archetypeIds: ["healing", "pirates"] },
        { id: "player2", archetypeIds: ["cats", "vampires"] },
      ],
    });
    const player = game.players[0];
    const ajani = findPoolCard(player, "ajanis_pridemate");
    const sanctifier = findPoolCard(player, "hinterland_sanctifier");
    const overseer = findPoolCard(player, "inspiring_overseer");
    player.battlefield = [ajani, sanctifier];
    setHand(player, [overseer]);
    giveMana(player, "W", 3);
    game.phase = "main1";

    const action = getLegalActions(game, player.playerId).find((candidate) => candidate.type === "playCreature");
    performAction(game, action!);
    resolveTopOfStack(game);

    expect(player.lifeTotal).toBe(22);
    expect(ajani.plusOneCounters).toBe(2);
    expect(getCreatureStats(ajani)).toEqual({ power: 4, toughness: 4 });
    expect(game.events.filter((event) => event.type === "lifeGained")).toHaveLength(2);
  });
});
