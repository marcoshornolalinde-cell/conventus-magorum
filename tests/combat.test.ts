import { describe, expect, it } from "vitest";

import { canAttack, hasKeyword, resolveCombatPhase } from "../src/core/combat.js";
import { createInitialGame } from "../src/core/gameState.js";
import type { InitialPlayerConfig } from "../src/core/gameState.js";
import type { CardInstance, CombatPlan, ContentBundle, LegalAction, PlayerState } from "../src/core/types.js";
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
    temporaryCannotDefend: false,
    attachedToId: null,
    doesNotUntap: false,
    enteredTurn: 0,
    activatedAbilityIdsUsed: [],
  };
}

function findPoolCardInPlace(player: PlayerState, cardId: string): CardInstance {
  const source = player.pool.find((instance) => instance.card.id === cardId);

  if (!source) {
    throw new Error(`Missing test card ${cardId}.`);
  }

  removeFromCurrentZones(player, source.instanceId);
  resetInstance(source);
  return source;
}

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
  instance.temporaryCannotDefend = false;
  instance.attachedToId = null;
  instance.doesNotUntap = false;
  instance.enteredTurn = 0;
  instance.activatedAbilityIdsUsed = [];
}

function setHand(player: PlayerState, cards: CardInstance[]): void {
  const testCardIds = new Set(cards.map((card) => card.instanceId));
  player.graveyard.push(...player.hand.filter((card) => !testCardIds.has(card.instanceId)));
  player.hand = [...cards];
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

  it("lets both players attack in the same combat and resolves attacking priority first", () => {
    const game = createInitialGame(content, {
      seed: "both-players-attack",
      players: defaultPlayers,
    });
    const firstAttacker = findPoolCard(game.players[0], "savannah_lions");
    const secondAttacker = findPoolCard(game.players[1], "hinterland_sanctifier");
    game.turnNumber = 2;
    game.phase = "combat";
    game.attackingPriorityPlayerId = game.players[0].playerId;
    game.activePlayerId = game.players[0].playerId;
    game.players[0].battlefield = [firstAttacker];
    game.players[1].battlefield = [secondAttacker];

    resolveCombatPhase(
      game,
      planFor(
        {
          playerId: game.players[0].playerId,
          attackerIds: [firstAttacker.instanceId],
          defenderIds: [],
        },
        {
          playerId: game.players[1].playerId,
          attackerIds: [secondAttacker.instanceId],
          defenderIds: [],
        },
      ),
    );

    expect(firstAttacker.tapped).toBe(true);
    expect(secondAttacker.tapped).toBe(true);
    expect(game.players[0].lifeTotal).toBe(19);
    expect(game.players[1].lifeTotal).toBe(18);

    const damageEvents = game.events.filter((event) => event.type === "damageDealt" && event.details?.combat === true);
    expect(damageEvents[0].sourceId).toBe(firstAttacker.instanceId);
    expect(damageEvents[1].sourceId).toBe(secondAttacker.instanceId);
  });

  it("prevents a menace attacker from being blocked by only one creature", () => {
    const game = createInitialGame(content, {
      seed: "combat-menace",
      players: defaultPlayers,
    });
    const attacker = withCombatStats(findPoolCard(game.players[0], "savannah_lions"), "2", "1", []);
    const blocker = withCombatStats(findPoolCard(game.players[1], "hinterland_sanctifier"), "1", "2", []);
    attacker.temporaryKeywords.push("Menace");
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

    expect(blocker.damageMarked).toBe(0);
    expect(game.players[1].lifeTotal).toBe(18);
  });

  it("applies Goblin Oriflamme to attacking creatures", () => {
    const game = createInitialGame(content, {
      seed: "combat-oriflamme",
      players: [
        { id: "player1", archetypeIds: ["cats", "goblins"] },
        { id: "player2", archetypeIds: ["healing", "pirates"] },
      ],
    });
    const attacker = findPoolCard(game.players[0], "savannah_lions");
    const oriflamme = findPoolCard(game.players[0], "goblin_oriflamme");
    game.turnNumber = 2;
    game.phase = "combat";
    game.attackingPriorityPlayerId = game.players[0].playerId;
    game.activePlayerId = game.players[0].playerId;
    game.players[0].battlefield = [attacker, oriflamme];
    game.players[1].battlefield = [];

    resolveCombatPhase(
      game,
      planFor({
        playerId: game.players[0].playerId,
        attackerIds: [attacker.instanceId],
        defenderIds: [],
      }),
    );

    expect(game.players[1].lifeTotal).toBe(17);
    expect(attacker.powerModifier).toBe(1);
  });

  it("grants deathtouch and lifelink to attacking Vampires from Crossway Troublemakers", () => {
    const game = createInitialGame(content, {
      seed: "combat-crossway",
      players: [
        { id: "player1", archetypeIds: ["vampires", "cats"] },
        { id: "player2", archetypeIds: ["healing", "pirates"] },
      ],
    });
    const attacker = findPoolCard(game.players[0], "vampire_interloper");
    const crossway = findPoolCard(game.players[0], "crossway_troublemakers");
    game.turnNumber = 2;
    game.phase = "combat";
    game.attackingPriorityPlayerId = game.players[0].playerId;
    game.activePlayerId = game.players[0].playerId;
    game.players[0].battlefield = [attacker, crossway];
    game.players[1].battlefield = [];

    resolveCombatPhase(
      game,
      planFor({
        playerId: game.players[0].playerId,
        attackerIds: [attacker.instanceId],
        defenderIds: [],
      }),
    );

    expect(hasKeyword(attacker, "Deathtouch")).toBe(true);
    expect(hasKeyword(attacker, "Lifelink")).toBe(true);
    expect(game.players[0].lifeTotal).toBe(22);
    expect(game.players[1].lifeTotal).toBe(18);
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

  it("lets players cast instants after attackers and blockers are paired before damage", () => {
    const game = createInitialGame(content, {
      seed: "paired-combat-instant",
      players: [
        { id: "player1", archetypeIds: ["cats", "healing"] },
        { id: "player2", archetypeIds: ["healing", "pirates"] },
      ],
    });
    const attacker = findPoolCardInPlace(game.players[0], "savannah_lions");
    const trick = findPoolCardInPlace(game.players[0], "moment_of_triumph");
    const blocker = findPoolCardInPlace(game.players[1], "hinterland_sanctifier");
    game.turnNumber = 2;
    game.attackingPriorityPlayerId = game.players[0].playerId;
    game.activePlayerId = game.players[0].playerId;
    game.players[0].battlefield = [attacker];
    setHand(game.players[0], [trick]);
    game.players[0].manaPool.W = 1;
    game.players[1].battlefield = [blocker];

    const chooseCombatAction = (currentGame: typeof game, playerId: string, legalActions: LegalAction[]): LegalAction => {
      const pairingsKnown = currentGame.log.some((entry) => entry.message.includes(`${attacker.card.name} is blocked by`));
      const castTrick = legalActions.find(
        (action) => action.type === "castSpell" && action.cardInstanceId === trick.instanceId,
      );

      if (pairingsKnown && playerId === game.players[0].playerId && castTrick) {
        return castTrick;
      }

      return legalActions.find((action) => action.type === "pass") ?? legalActions[0];
    };

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
      chooseCombatAction,
    );

    expect(game.stack).toHaveLength(0);
    expect(game.players[0].lifeTotal).toBe(22);
    expect(game.players[0].battlefield.map((instance) => instance.instanceId)).toContain(attacker.instanceId);
    expect(game.players[1].graveyard.map((instance) => instance.instanceId)).toContain(blocker.instanceId);
    expect(game.events.map((event) => event.type)).toEqual(expect.arrayContaining(["spellCast", "spellResolved"]));
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
