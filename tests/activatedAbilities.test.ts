import { describe, expect, it } from "vitest";

import { getLegalActions, performAction } from "../src/core/actions.js";
import { canBlock, getCreatureStats, hasKeyword, resolveCombatPhase } from "../src/core/combat.js";
import { createInitialGame } from "../src/core/gameState.js";
import type { InitialPlayerConfig } from "../src/core/gameState.js";
import type { CardInstance, ContentBundle, PlayerState } from "../src/core/types.js";
import { dispatchGameEvent } from "../src/core/triggerEngine.js";
import { chooseBasicCombatPlan, chooseFirstPlayableCreature } from "../src/ai/heuristicAI.js";
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

function resetInstance(instance: CardInstance): CardInstance {
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
  instance.additionalSubtypes = [];
  instance.losesAbilities = false;
  instance.cannotAttack = false;
  instance.cannotDefend = false;
  instance.temporaryCannotDefend = false;
  instance.attachedToId = null;
  instance.doesNotUntap = false;
  instance.enteredTurn = 0;
  instance.activatedAbilityIdsUsed = [];
  return instance;
}

function findPoolCard(player: PlayerState, cardId: string): CardInstance {
  const source = player.pool.find((instance) => instance.card.id === cardId);

  if (!source) {
    throw new Error(`Missing test card ${cardId}.`);
  }

  removeFromCurrentZones(player, source.instanceId);
  return resetInstance(source);
}

function findPoolCards(player: PlayerState, cardId: string, count: number): CardInstance[] {
  const sources = player.pool.filter((instance) => instance.card.id === cardId).slice(0, count);

  if (sources.length !== count) {
    throw new Error(`Missing ${count} test copies of ${cardId}.`);
  }

  return sources.map((source) => {
    removeFromCurrentZones(player, source.instanceId);
    return resetInstance(source);
  });
}

function createGame(seed: string, players: [InitialPlayerConfig, InitialPlayerConfig]) {
  const game = createInitialGame(content, { seed, players });
  game.phase = "main1";
  game.turnNumber = 5;
  return game;
}

describe("activated abilities", () => {
  it("taps Vampire Neonate to drain the opponent", () => {
    const game = createGame("vampire-neonate", [
      { id: "player1", archetypeIds: ["vampires", "undead"] },
      { id: "player2", archetypeIds: ["cats", "healing"] },
    ]);
    const player = game.players[0];
    const opponent = game.players[1];
    const neonate = findPoolCard(player, "vampire_neonate");
    player.battlefield = [neonate];
    player.manaPool.C = 2;

    const action = getLegalActions(game, player.playerId).find(
      (candidate) => candidate.type === "activateAbility" && candidate.abilityId.includes("drain"),
    );
    expect(action).toBeDefined();
    performAction(game, action!);

    expect(neonate.tapped).toBe(true);
    expect(player.lifeTotal).toBe(21);
    expect(opponent.lifeTotal).toBe(19);
  });

  it("draws cards from repeatable blue activated abilities", () => {
    const game = createGame("blue-draw-activation", [
      { id: "player1", archetypeIds: ["pirates", "wizards"] },
      { id: "player2", archetypeIds: ["cats", "healing"] },
    ]);
    const player = game.players[0];
    const archaeologist = findPoolCard(player, "mystic_archaeologist");
    player.battlefield = [archaeologist];
    player.manaPool.U = 5;
    const handSize = player.hand.length;

    const action = getLegalActions(game, player.playerId).find(
      (candidate) => candidate.type === "activateAbility" && candidate.abilityId.includes("draw"),
    );
    expect(action).toBeDefined();
    performAction(game, action!);

    expect(player.hand).toHaveLength(handSize + 2);
    expect(player.manaPool.U).toBe(0);
  });

  it("sacrifices another creature to grow Hungry Ghoul", () => {
    const game = createGame("hungry-ghoul", [
      { id: "player1", archetypeIds: ["undead", "vampires"] },
      { id: "player2", archetypeIds: ["cats", "healing"] },
    ]);
    const player = game.players[0];
    const ghoul = findPoolCard(player, "hungry_ghoul");
    const sacrifice = findPoolCard(player, "diregraf_ghoul");
    player.battlefield = [ghoul, sacrifice];
    player.manaPool.B = 1;

    const action = getLegalActions(game, player.playerId).find(
      (candidate) => candidate.type === "activateAbility" && candidate.abilityId.includes("sacrifice_counter"),
    );
    expect(action).toBeDefined();
    performAction(game, action!);

    expect(player.graveyard.map((instance) => instance.instanceId)).toContain(sacrifice.instanceId);
    expect(ghoul.plusOneCounters).toBe(1);
  });

  it("uses Wildheart Invoker to pump and grant trample", () => {
    const game = createGame("wildheart-invoker", [
      { id: "player1", archetypeIds: ["elves", "primal"] },
      { id: "player2", archetypeIds: ["cats", "healing"] },
    ]);
    const player = game.players[0];
    const invoker = findPoolCard(player, "wildheart_invoker");
    const target = findPoolCard(player, "llanowar_elves");
    player.battlefield = [invoker, target];
    player.manaPool.G = 8;

    const action = getLegalActions(game, player.playerId).find(
      (candidate) =>
        candidate.type === "activateAbility" &&
        candidate.abilityId.includes("pump") &&
        candidate.targetIds[0] === target.instanceId,
    );
    expect(action).toBeDefined();
    performAction(game, action!);

    expect(getCreatureStats(target)).toEqual({ power: 6, toughness: 6 });
    expect(hasKeyword(target, "Trample")).toBe(true);
  });

  it("activates Mild-Mannered Librarian only once", () => {
    const game = createGame("librarian-transform", [
      { id: "player1", archetypeIds: ["primal", "elves"] },
      { id: "player2", archetypeIds: ["cats", "healing"] },
    ]);
    const player = game.players[0];
    const librarian = findPoolCard(player, "mild_mannered_librarian");
    player.battlefield = [librarian];
    player.manaPool.G = 4;
    const handSize = player.hand.length;

    const action = getLegalActions(game, player.playerId).find(
      (candidate) => candidate.type === "activateAbility" && candidate.abilityId.includes("transform"),
    );
    expect(action).toBeDefined();
    performAction(game, action!);

    expect(librarian.plusOneCounters).toBe(2);
    expect(librarian.additionalSubtypes).toContain("Werewolf");
    expect(player.hand).toHaveLength(handSize + 1);
    player.manaPool.G = 4;
    expect(
      getLegalActions(game, player.playerId).some(
        (candidate) => candidate.type === "activateAbility" && candidate.abilityId.includes("transform"),
      ),
    ).toBe(false);
  });

  it("sacrifices Thrashing Brontodon to destroy an artifact or enchantment", () => {
    const game = createGame("brontodon-destroy", [
      { id: "player1", archetypeIds: ["elves", "primal"] },
      { id: "player2", archetypeIds: ["cats", "healing"] },
    ]);
    const player = game.players[0];
    const opponent = game.players[1];
    const brontodon = findPoolCard(player, "thrashing_brontodon");
    const pacifism = findPoolCard(opponent, "pacifism");
    player.battlefield = [brontodon];
    opponent.battlefield = [pacifism];
    player.manaPool.G = 1;

    const action = getLegalActions(game, player.playerId).find(
      (candidate) => candidate.type === "activateAbility" && candidate.abilityId.includes("destroy"),
    );
    expect(action).toBeDefined();
    performAction(game, action!);

    expect(player.graveyard.map((instance) => instance.instanceId)).toContain(brontodon.instanceId);
    expect(opponent.graveyard.map((instance) => instance.instanceId)).toContain(pacifism.instanceId);
  });

  it("returns Reassembling Skeleton from graveyard tapped", () => {
    const game = createGame("reassembling-skeleton", [
      { id: "player1", archetypeIds: ["undead", "vampires"] },
      { id: "player2", archetypeIds: ["cats", "healing"] },
    ]);
    const player = game.players[0];
    const skeleton = findPoolCard(player, "reassembling_skeleton");
    player.graveyard = [skeleton];
    player.manaPool.B = 2;

    const action = getLegalActions(game, player.playerId).find(
      (candidate) => candidate.type === "activateAbility" && candidate.abilityId.includes("return_tapped"),
    );
    expect(action).toBeDefined();
    performAction(game, action!);

    expect(player.graveyard.map((instance) => instance.instanceId)).not.toContain(skeleton.instanceId);
    expect(player.battlefield.map((instance) => instance.instanceId)).toContain(skeleton.instanceId);
    expect(skeleton.tapped).toBe(true);
  });

  it("exiles Suspicious Shambler from graveyard to create Zombie tokens", () => {
    const game = createGame("suspicious-shambler", [
      { id: "player1", archetypeIds: ["undead", "vampires"] },
      { id: "player2", archetypeIds: ["cats", "healing"] },
    ]);
    const player = game.players[0];
    const shambler = findPoolCard(player, "suspicious_shambler");
    player.graveyard = [shambler];
    player.manaPool.B = 6;

    const action = getLegalActions(game, player.playerId).find(
      (candidate) => candidate.type === "activateAbility" && candidate.abilityId.includes("create_zombies"),
    );
    expect(action).toBeDefined();
    performAction(game, action!);

    expect(player.exile.map((instance) => instance.instanceId)).toContain(shambler.instanceId);
    const tokens = player.battlefield.filter((instance) => instance.isToken);
    expect(tokens).toHaveLength(2);
    expect(tokens.every((token) => token.card.name === "Zombie Token")).toBe(true);
  });

  it("taps Goblin Smuggler to make another small creature unblockable", () => {
    const game = createGame("goblin-smuggler", [
      { id: "player1", archetypeIds: ["goblins", "inferno"] },
      { id: "player2", archetypeIds: ["cats", "healing"] },
    ]);
    const player = game.players[0];
    const opponent = game.players[1];
    const smuggler = findPoolCard(player, "goblin_smuggler");
    const target = findPoolCard(player, "swab_goblin");
    const blocker = findPoolCard(opponent, "hinterland_sanctifier");
    player.battlefield = [smuggler, target];
    opponent.battlefield = [blocker];

    expect(canBlock(target, blocker)).toBe(true);

    const action = getLegalActions(game, player.playerId).find(
      (candidate) =>
        candidate.type === "activateAbility" &&
        candidate.abilityId.includes("unblockable") &&
        candidate.targetIds[0] === target.instanceId,
    );
    expect(action).toBeDefined();
    performAction(game, action!);

    expect(smuggler.tapped).toBe(true);
    expect(hasKeyword(target, "Unblockable")).toBe(true);
    expect(canBlock(target, blocker)).toBe(false);
  });

  it("uses Jazal Goldmane to pump attacking creatures by the attacker count", () => {
    const game = createGame("jazal-goldmane", [
      { id: "player1", archetypeIds: ["cats", "healing"] },
      { id: "player2", archetypeIds: ["goblins", "inferno"] },
    ]);
    const player = game.players[0];
    const jazal = findPoolCard(player, "jazal_goldmane");
    const firstAttacker = findPoolCard(player, "savannah_lions");
    const secondAttacker = findPoolCard(player, "leonin_skyhunter");
    player.battlefield = [jazal, firstAttacker, secondAttacker];
    player.manaPool.W = 5;
    game.phase = "combat";

    dispatchGameEvent(game, { type: "creatureAttacked", playerId: player.playerId, sourceId: firstAttacker.instanceId });
    dispatchGameEvent(game, { type: "creatureAttacked", playerId: player.playerId, sourceId: secondAttacker.instanceId });

    const action = getLegalActions(game, player.playerId).find(
      (candidate) => candidate.type === "activateAbility" && candidate.abilityId.includes("attacking_pump"),
    );
    expect(action).toBeDefined();
    performAction(game, action!);

    expect(getCreatureStats(firstAttacker)).toEqual({ power: 4, toughness: 3 });
    expect(getCreatureStats(secondAttacker)).toEqual({ power: 4, toughness: 4 });
  });

  it("puts a counter on another attacking creature with Ingenious Leonin and grants first strike to Cats", () => {
    const game = createGame("ingenious-leonin", [
      { id: "player1", archetypeIds: ["cats", "healing"] },
      { id: "player2", archetypeIds: ["goblins", "inferno"] },
    ]);
    const player = game.players[0];
    const leonin = findPoolCard(player, "ingenious_leonin");
    const attacker = findPoolCard(player, "savannah_lions");
    player.battlefield = [leonin, attacker];
    player.manaPool.W = 4;
    game.phase = "combat";

    dispatchGameEvent(game, { type: "creatureAttacked", playerId: player.playerId, sourceId: attacker.instanceId });

    const action = getLegalActions(game, player.playerId).find(
      (candidate) =>
        candidate.type === "activateAbility" &&
        candidate.abilityId.includes("attacking_counter") &&
        candidate.targetIds[0] === attacker.instanceId,
    );
    expect(action).toBeDefined();
    performAction(game, action!);

    expect(attacker.plusOneCounters).toBe(1);
    expect(hasKeyword(attacker, "First strike")).toBe(true);
    expect(getCreatureStats(attacker)).toEqual({ power: 3, toughness: 2 });
  });

  it("grants flying with Dropkick Bomber and sacrifices the creature after combat damage", () => {
    const game = createGame("dropkick-bomber", [
      { id: "player1", archetypeIds: ["goblins", "inferno"] },
      { id: "player2", archetypeIds: ["cats", "healing"] },
    ]);
    const player = game.players[0];
    const opponent = game.players[1];
    const bomber = findPoolCard(player, "dropkick_bomber");
    const goblin = findPoolCard(player, "swab_goblin");
    player.battlefield = [bomber, goblin];
    opponent.battlefield = [];
    player.manaPool.R = 1;

    const action = getLegalActions(game, player.playerId).find(
      (candidate) =>
        candidate.type === "activateAbility" &&
        candidate.abilityId.includes("flying_sacrifice") &&
        candidate.targetIds[0] === goblin.instanceId,
    );
    expect(action).toBeDefined();
    performAction(game, action!);

    expect(hasKeyword(goblin, "Flying")).toBe(true);
    expect(hasKeyword(goblin, "SacrificeOnCombatDamage")).toBe(true);

    game.turnNumber = 6;
    game.attackingPriorityPlayerId = player.playerId;
    resolveCombatPhase(game, (_currentGame, playerId) => ({
      playerId,
      attackerIds: playerId === player.playerId ? [goblin.instanceId] : [],
      defenderIds: [],
    }));

    expect(player.graveyard.map((instance) => instance.instanceId)).toContain(goblin.instanceId);
    expect(opponent.lifeTotal).toBeLessThan(20);
  });

  it("lets the AI use Goblin Smuggler before combat positioning so a small attacker cannot be blocked", () => {
    const game = createGame("ai-smuggler-combat-window", [
      { id: "player1", archetypeIds: ["goblins", "inferno"] },
      { id: "player2", archetypeIds: ["cats", "healing"] },
    ]);
    const player = game.players[0];
    const opponent = game.players[1];
    const smuggler = findPoolCard(player, "goblin_smuggler");
    const attacker = findPoolCard(player, "swab_goblin");
    const blocker = findPoolCard(opponent, "savannah_lions");
    player.battlefield = [smuggler, attacker];
    opponent.battlefield = [blocker];
    game.turnNumber = 6;
    game.attackingPriorityPlayerId = player.playerId;

    resolveCombatPhase(game, chooseBasicCombatPlan, chooseFirstPlayableCreature);

    expect(smuggler.tapped).toBe(true);
    expect(hasKeyword(attacker, "Unblockable")).toBe(true);
    expect(opponent.lifeTotal).toBe(18);
    expect(game.events.some((event) => event.type === "abilityActivated" && event.sourceId === smuggler.instanceId)).toBe(true);
  });

  it("lets the AI activate mana in combat and spend it on Jazal after attackers are declared", () => {
    const game = createGame("ai-jazal-combat-window", [
      { id: "player1", archetypeIds: ["cats", "healing"] },
      { id: "player2", archetypeIds: ["goblins", "inferno"] },
    ]);
    const player = game.players[0];
    const opponent = game.players[1];
    const jazal = findPoolCard(player, "jazal_goldmane");
    const firstAttacker = findPoolCard(player, "savannah_lions");
    const secondAttacker = findPoolCard(player, "leonin_skyhunter");
    const plains = findPoolCards(player, "plains", 5);
    player.battlefield = [jazal, firstAttacker, secondAttacker, ...plains];
    opponent.battlefield = [];
    game.turnNumber = 6;
    game.attackingPriorityPlayerId = player.playerId;

    resolveCombatPhase(game, chooseBasicCombatPlan, chooseFirstPlayableCreature);

    expect(plains.every((land) => land.tapped)).toBe(true);
    expect(player.manaPool.W).toBe(0);
    expect(game.events.some((event) => event.type === "abilityActivated" && event.sourceId === jazal.instanceId)).toBe(true);
    expect(getCreatureStats(firstAttacker).power).toBeGreaterThan(2);
    expect(getCreatureStats(secondAttacker).power).toBeGreaterThan(2);
  });
});
