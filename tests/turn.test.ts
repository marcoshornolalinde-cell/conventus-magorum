import { describe, expect, it } from "vitest";

import { getLegalActions, performAction, resolveTopOfStack } from "../src/core/actions.js";
import { createInitialGame } from "../src/core/gameState.js";
import type { InitialPlayerConfig } from "../src/core/gameState.js";
import { beginGeneralTurn, playOneGeneralTurn, runMainPhase } from "../src/core/turn.js";
import type { CardInstance, ContentBundle, LegalAction, PlayerState } from "../src/core/types.js";
import { chooseFirstPlayableCreature } from "../src/ai/heuristicAI.js";
import { loadContentBundle } from "../src/data/loadContent.js";
import { runSelfplay } from "../src/selfplay/runMatch.js";

const content: ContentBundle = loadContentBundle();
const defaultPlayers: [InitialPlayerConfig, InitialPlayerConfig] = [
  { id: "player1", archetypeIds: ["cats", "vampires"] },
  { id: "player2", archetypeIds: ["healing", "pirates"] },
];

function removeFromCurrentZones(player: PlayerState, instanceId: string): void {
  player.spellDeck = player.spellDeck.filter((instance) => instance.instanceId !== instanceId);
  player.landDeck = player.landDeck.filter((instance) => instance.instanceId !== instanceId);
  player.hand = player.hand.filter((instance) => instance.instanceId !== instanceId);
  player.battlefield = player.battlefield.filter((instance) => instance.instanceId !== instanceId);
  player.graveyard = player.graveyard.filter((instance) => instance.instanceId !== instanceId);
  player.exile = player.exile.filter((instance) => instance.instanceId !== instanceId);
}

function findPoolCard(player: PlayerState, cardId: string): CardInstance {
  const source = player.pool.find((instance) => instance.card.id === cardId);

  if (!source) {
    throw new Error(`Missing test card ${cardId}.`);
  }

  removeFromCurrentZones(player, source.instanceId);
  source.tapped = false;
  source.damageMarked = 0;
  source.deathtouchDamageMarked = 0;
  source.powerModifier = 0;
  source.toughnessModifier = 0;
  source.staticPowerModifier = 0;
  source.staticToughnessModifier = 0;
  source.basePowerOverride = null;
  source.baseToughnessOverride = null;
  source.plusOneCounters = 0;
  source.staticKeywords = [];
  source.temporaryKeywords = [];
  source.losesAbilities = false;
  source.cannotAttack = false;
  source.cannotDefend = false;
  source.temporaryCannotDefend = false;
  source.attachedToId = null;
  source.doesNotUntap = false;
  source.enteredTurn = 0;
  return source;
}

function setHand(player: PlayerState, cards: CardInstance[]): void {
  const testCardIds = new Set(cards.map((card) => card.instanceId));
  player.graveyard.push(...player.hand.filter((card) => !testCardIds.has(card.instanceId)));
  player.hand = [...cards];
}

describe("general turn start", () => {
  it("puts a land onto each battlefield, produces mana, and draws from spellDeck", () => {
    const game = createInitialGame(content, {
      seed: "turn-start",
      players: defaultPlayers,
    });

    beginGeneralTurn(game);

    expect(game.turnNumber).toBe(1);
    expect(game.phase).toBe("main1");
    expect(game.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["gameCreated", "turnStarted", "landEntered", "manaProduced", "cardDrawn"]),
    );

    for (const player of game.players) {
      expect(player.battlefield.filter((instance) => instance.card.isLand)).toHaveLength(1);
      expect(Object.values(player.manaPool).reduce((total, amount) => total + amount, 0)).toBe(1);
      expect(player.hand).toHaveLength(5);
      expect(player.cardsDrawnThisTurn).toBe(1);
    }
  });

  it("ends the game when a player cannot draw from spellDeck", () => {
    const game = createInitialGame(content, {
      seed: "draw-loss",
      players: defaultPlayers,
    });
    game.players[0].graveyard.push(...game.players[0].spellDeck);
    game.players[0].spellDeck = [];

    beginGeneralTurn(game);

    expect(game.status).toBe("gameOver");
    expect(game.loserIds).toEqual([game.players[0].playerId]);
    expect(game.winnerId).toBe(game.players[1].playerId);
  });
});

describe("basic actions", () => {
  it("plays and resolves a payable creature through the stack", () => {
    const game = createInitialGame(content, {
      seed: "play-creature",
      players: defaultPlayers,
    });
    const player = game.players[0];
    const creature = findPoolCard(player, "savannah_lions");

    expect(creature).toBeDefined();
    setHand(player, [creature]);
    player.manaPool.W = 1;
    game.phase = "main1";

    const action = getLegalActions(game, player.playerId).find((candidate) => candidate.type === "playCreature");

    expect(action).toBeDefined();
    performAction(game, action as LegalAction);
    expect(game.stack).toHaveLength(1);

    resolveTopOfStack(game);
    expect(game.stack).toHaveLength(0);
    expect(player.battlefield.some((instance) => instance.card.cardTypes.includes("Creature"))).toBe(true);
  });
});

describe("selfplay", () => {
  it("runs a deterministic headless match until game over or turn limit", () => {
    const firstResult = runSelfplay(content, {
      seed: "selfplay-test",
      players: defaultPlayers,
      maxTurns: 30,
    });
    const secondResult = runSelfplay(content, {
      seed: "selfplay-test",
      players: defaultPlayers,
      maxTurns: 30,
    });

    expect(firstResult.game.turnNumber).toBeGreaterThan(0);
    expect(firstResult.game.turnNumber).toBeLessThanOrEqual(30);
    expect(firstResult.game.log.map((entry) => entry.message)).toEqual(
      secondResult.game.log.map((entry) => entry.message),
    );
  });

  it("can play one full simplified general turn", () => {
    const game = createInitialGame(content, {
      seed: "one-turn",
      players: defaultPlayers,
    });
    const choosePass = (_game: typeof game, playerId: string, legalActions: LegalAction[]) =>
      legalActions.find((action) => action.type === "pass" && action.playerId === playerId) ?? legalActions[0];

    const summary = playOneGeneralTurn(game, choosePass);

    expect(summary.turnNumber).toBe(1);
    expect(game.phase).toBe("final");
    expect(game.stack).toHaveLength(0);
    expect(game.players.every((player) => Object.values(player.manaPool).every((amount) => amount === 0))).toBe(true);
  });
});

describe("response windows", () => {
  it("allows a player to counter a spell before it resolves during main phase", () => {
    const game = createInitialGame(content, {
      seed: "response-counter",
      players: defaultPlayers,
    });
    const caster = game.players[0];
    const responder = game.players[1];
    const creature = findPoolCard(caster, "savannah_lions");
    const cancel = findPoolCard(responder, "cancel");
    setHand(caster, [creature]);
    setHand(responder, [cancel]);
    caster.manaPool.W = 1;
    responder.manaPool.U = 3;
    game.phase = "main1";
    game.attackingPriorityPlayerId = caster.playerId;
    game.activePlayerId = caster.playerId;

    runMainPhase(game, "main1", chooseFirstPlayableCreature);

    expect(caster.battlefield).toHaveLength(0);
    expect(caster.graveyard.map((instance) => instance.instanceId)).toContain(creature.instanceId);
    expect(responder.graveyard.map((instance) => instance.instanceId)).toContain(cancel.instanceId);
  });
});
