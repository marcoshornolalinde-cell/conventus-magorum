import { describe, expect, it } from "vitest";

import { canAttack, resolveCombatPhase } from "../src/core/combat.js";
import { createInitialGame } from "../src/core/gameState.js";
import type { InitialPlayerConfig } from "../src/core/gameState.js";
import type { CardInstance, CombatPlan, ContentBundle, PlayerState } from "../src/core/types.js";
import { loadContentBundle } from "../src/data/loadContent.js";

const content: ContentBundle = loadContentBundle();
const defaultPlayers: [InitialPlayerConfig, InitialPlayerConfig] = [
  { id: "player1", archetypeIds: ["cats", "vampires"] },
  { id: "player2", archetypeIds: ["healing", "pirates"] },
];

function findPoolCard(player: PlayerState, cardId: string): CardInstance {
  const source = player.pool.find((instance) => instance.card.id === cardId);

  if (!source) {
    throw new Error(`Missing test card ${cardId}.`);
  }

  return {
    ...source,
    instanceId: `${source.instanceId}:test`,
    card: {
      ...source.card,
      colorIdentity: [...source.card.colorIdentity],
      colorNames: [...source.card.colorNames],
      cardTypes: [...source.card.cardTypes],
      keywords: [...source.card.keywords],
      keywordIds: [...source.card.keywordIds],
    },
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
    attachedToId: null,
    doesNotUntap: false,
    enteredTurn: 0,
  };
}

function withCombatStats(
  instance: CardInstance,
  power: string,
  toughness: string,
  keywords: string[],
): CardInstance {
  return {
    ...instance,
    card: {
      ...instance.card,
      power,
      toughness,
      keywords,
      keywordIds: keywords.map((keyword) => keyword.toLowerCase().replaceAll(" ", "_")),
    },
  };
}

function planFor(...plans: CombatPlan[]) {
  return (_game: unknown, playerId: string): CombatPlan => {
    const plan = plans.find((candidate) => candidate.playerId === playerId);

    if (!plan) {
      return {
        playerId,
        attackerIds: [],
        defenderIds: [],
      };
    }

    return plan;
  };
}

describe("combat", () => {
  it("deals creature power to the defending player when unblocked", () => {
    const game = createInitialGame(content, {
      seed: "combat-unblocked",
      players: defaultPlayers,
    });
    const attacker = findPoolCard(game.players[0], "savannah_lions");
    game.turnNumber = 2;
    game.phase = "combat";
    game.attackingPriorityPlayerId = game.players[0].playerId;
    game.activePlayerId = game.players[0].playerId;
    game.players[0].battlefield = [attacker];
    game.players[1].battlefield = [];

    resolveCombatPhase(
      game,
      planFor({
        playerId: game.players[0].playerId,
        attackerIds: [attacker.instanceId],
        defenderIds: [],
      }),
    );

    expect(game.players[1].lifeTotal).toBe(18);
    expect(attacker.tapped).toBe(true);
  });

  it("assigns blockers and moves creatures with lethal damage to graveyards", () => {
    const game = createInitialGame(content, {
      seed: "combat-blocked",
      players: defaultPlayers,
    });
    const attacker = findPoolCard(game.players[0], "savannah_lions");
    const blocker = findPoolCard(game.players[1], "hinterland_sanctifier");
    game.turnNumber = 2;
    game.phase = "combat";
    game.attackingPriorityPlayerId = game.players[0].playerId;
    game.activePlayerId = game.players[0].playerId;
    game.players[0].battlefield = [attacker];
    game.players[1].battlefield = [blocker];

    resolveCombatPhase(
      game,
      planFor(
        {
          playerId: game.players[0].playerId,
          attackerIds: [attacker.instanceId],
          defenderIds: [],
        },
        {
          playerId: game.players[1].playerId,
          attackerIds: [],
          defenderIds: [blocker.instanceId],
        },
      ),
    );

    expect(game.players[0].graveyard.map((instance) => instance.card.id)).toContain("savannah_lions");
    expect(game.players[1].graveyard.map((instance) => instance.card.id)).toContain("hinterland_sanctifier");
    expect(game.players[1].lifeTotal).toBe(20);
  });

  it("does not allow a non-haste creature to attack on the turn it entered", () => {
    const game = createInitialGame(content, {
      seed: "summoning-sickness",
      players: defaultPlayers,
    });
    const creature = findPoolCard(game.players[0], "savannah_lions");
    game.turnNumber = 3;
    creature.enteredTurn = 3;

    expect(canAttack(creature, game.turnNumber)).toBe(false);
  });

  it("lets first strike damage destroy a blocker before it deals regular damage", () => {
    const game = createInitialGame(content, {
      seed: "first-strike",
      players: defaultPlayers,
    });
    const attacker = withCombatStats(findPoolCard(game.players[0], "savannah_lions"), "2", "2", ["First strike"]);
    const blocker = withCombatStats(findPoolCard(game.players[1], "hinterland_sanctifier"), "2", "2", []);
    game.turnNumber = 2;
    game.attackingPriorityPlayerId = game.players[0].playerId;
    game.activePlayerId = game.players[0].playerId;
    game.players[0].battlefield = [attacker];
    game.players[1].battlefield = [blocker];

    resolveCombatPhase(
      game,
      planFor(
        {
          playerId: game.players[0].playerId,
          attackerIds: [attacker.instanceId],
          defenderIds: [],
        },
        {
          playerId: game.players[1].playerId,
          attackerIds: [],
          defenderIds: [blocker.instanceId],
        },
      ),
    );

    expect(game.players[0].battlefield.map((instance) => instance.instanceId)).toContain(attacker.instanceId);
    expect(game.players[0].graveyard).toHaveLength(0);
    expect(game.players[1].graveyard.map((instance) => instance.instanceId)).toContain(blocker.instanceId);
  });

  it("lets double strike deal first-strike and regular combat damage", () => {
    const game = createInitialGame(content, {
      seed: "double-strike",
      players: defaultPlayers,
    });
    const attacker = withCombatStats(findPoolCard(game.players[0], "savannah_lions"), "2", "2", ["Double strike"]);
    game.turnNumber = 2;
    game.attackingPriorityPlayerId = game.players[0].playerId;
    game.activePlayerId = game.players[0].playerId;
    game.players[0].battlefield = [attacker];
    game.players[1].battlefield = [];

    resolveCombatPhase(
      game,
      planFor({
        playerId: game.players[0].playerId,
        attackerIds: [attacker.instanceId],
        defenderIds: [],
      }),
    );

    expect(game.players[1].lifeTotal).toBe(16);
  });

  it("assigns trample overflow to the defending player", () => {
    const game = createInitialGame(content, {
      seed: "trample",
      players: defaultPlayers,
    });
    const attacker = withCombatStats(findPoolCard(game.players[0], "savannah_lions"), "5", "5", ["Trample"]);
    const blocker = withCombatStats(findPoolCard(game.players[1], "hinterland_sanctifier"), "1", "2", []);
    game.turnNumber = 2;
    game.attackingPriorityPlayerId = game.players[0].playerId;
    game.activePlayerId = game.players[0].playerId;
    game.players[0].battlefield = [attacker];
    game.players[1].battlefield = [blocker];

    resolveCombatPhase(
      game,
      planFor(
        {
          playerId: game.players[0].playerId,
          attackerIds: [attacker.instanceId],
          defenderIds: [],
        },
        {
          playerId: game.players[1].playerId,
          attackerIds: [],
          defenderIds: [blocker.instanceId],
        },
      ),
    );

    expect(game.players[1].lifeTotal).toBe(17);
    expect(game.players[1].graveyard.map((instance) => instance.instanceId)).toContain(blocker.instanceId);
  });

  it("gains life when a creature with lifelink deals damage", () => {
    const game = createInitialGame(content, {
      seed: "lifelink",
      players: defaultPlayers,
    });
    const attacker = withCombatStats(findPoolCard(game.players[0], "savannah_lions"), "2", "2", ["Lifelink"]);
    game.turnNumber = 2;
    game.attackingPriorityPlayerId = game.players[0].playerId;
    game.activePlayerId = game.players[0].playerId;
    game.players[0].battlefield = [attacker];
    game.players[1].battlefield = [];

    resolveCombatPhase(
      game,
      planFor({
        playerId: game.players[0].playerId,
        attackerIds: [attacker.instanceId],
        defenderIds: [],
      }),
    );

    expect(game.players[0].lifeTotal).toBe(22);
    expect(game.players[1].lifeTotal).toBe(18);
  });

  it("destroys a creature dealt any damage by deathtouch", () => {
    const game = createInitialGame(content, {
      seed: "deathtouch",
      players: defaultPlayers,
    });
    const attacker = withCombatStats(findPoolCard(game.players[0], "savannah_lions"), "1", "1", ["Deathtouch"]);
    const blocker = withCombatStats(findPoolCard(game.players[1], "hinterland_sanctifier"), "0", "6", []);
    game.turnNumber = 2;
    game.attackingPriorityPlayerId = game.players[0].playerId;
    game.activePlayerId = game.players[0].playerId;
    game.players[0].battlefield = [attacker];
    game.players[1].battlefield = [blocker];

    resolveCombatPhase(
      game,
      planFor(
        {
          playerId: game.players[0].playerId,
          attackerIds: [attacker.instanceId],
          defenderIds: [],
        },
        {
          playerId: game.players[1].playerId,
          attackerIds: [],
          defenderIds: [blocker.instanceId],
        },
      ),
    );

    expect(game.players[0].battlefield.map((instance) => instance.instanceId)).toContain(attacker.instanceId);
    expect(game.players[1].graveyard.map((instance) => instance.instanceId)).toContain(blocker.instanceId);
  });

  it("needs only 1 deathtouch damage per blocker before trampling over", () => {
    const game = createInitialGame(content, {
      seed: "deathtouch-trample",
      players: defaultPlayers,
    });
    const attacker = withCombatStats(findPoolCard(game.players[0], "savannah_lions"), "4", "4", [
      "Deathtouch",
      "Trample",
    ]);
    const blocker = withCombatStats(findPoolCard(game.players[1], "hinterland_sanctifier"), "0", "6", []);
    game.turnNumber = 2;
    game.attackingPriorityPlayerId = game.players[0].playerId;
    game.activePlayerId = game.players[0].playerId;
    game.players[0].battlefield = [attacker];
    game.players[1].battlefield = [blocker];

    resolveCombatPhase(
      game,
      planFor(
        {
          playerId: game.players[0].playerId,
          attackerIds: [attacker.instanceId],
          defenderIds: [],
        },
        {
          playerId: game.players[1].playerId,
          attackerIds: [],
          defenderIds: [blocker.instanceId],
        },
      ),
    );

    expect(game.players[1].lifeTotal).toBe(17);
    expect(game.players[1].graveyard.map((instance) => instance.instanceId)).toContain(blocker.instanceId);
  });

  it("lets first strike deathtouch assign 1 damage to each of several blockers", () => {
    const game = createInitialGame(content, {
      seed: "first-strike-deathtouch",
      players: defaultPlayers,
    });
    const attacker = withCombatStats(findPoolCard(game.players[0], "savannah_lions"), "2", "2", [
      "First strike",
      "Deathtouch",
    ]);
    const firstBlocker = withCombatStats(findPoolCard(game.players[1], "hinterland_sanctifier"), "0", "6", []);
    const secondBlocker = withCombatStats(findPoolCard(game.players[1], "bishops_soldier"), "0", "6", []);
    game.turnNumber = 2;
    game.attackingPriorityPlayerId = game.players[0].playerId;
    game.activePlayerId = game.players[0].playerId;
    game.players[0].battlefield = [attacker];
    game.players[1].battlefield = [firstBlocker, secondBlocker];

    resolveCombatPhase(
      game,
      planFor(
        {
          playerId: game.players[0].playerId,
          attackerIds: [attacker.instanceId],
          defenderIds: [],
        },
        {
          playerId: game.players[1].playerId,
          attackerIds: [],
          defenderIds: [firstBlocker.instanceId, secondBlocker.instanceId],
        },
      ),
    );

    expect(game.players[0].battlefield.map((instance) => instance.instanceId)).toContain(attacker.instanceId);
    expect(game.players[1].graveyard.map((instance) => instance.instanceId)).toEqual(
      expect.arrayContaining([firstBlocker.instanceId, secondBlocker.instanceId]),
    );
  });
});
