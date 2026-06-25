import { describe, expect, it } from "vitest";

import { getLegalActions, performAction, resolveTopOfStack } from "../src/core/actions.js";
import { canAttack, canDefend, getCreatureStats, hasKeyword } from "../src/core/combat.js";
import { createInitialGame } from "../src/core/gameState.js";
import type { InitialPlayerConfig } from "../src/core/gameState.js";
import type { CardInstance, ContentBundle, PlayerState } from "../src/core/types.js";
import { chooseFirstPlayableCreature } from "../src/ai/heuristicAI.js";
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
}

function setHand(player: PlayerState, cards: CardInstance[]): void {
  const testCardIds = new Set(cards.map((card) => card.instanceId));
  player.graveyard.push(...player.hand.filter((card) => !testCardIds.has(card.instanceId)));
  player.hand = [...cards];
}

function giveMana(player: PlayerState, color: "W" | "U" | "B" | "R" | "G" | "C", amount: number): void {
  player.manaPool[color] = amount;
}

describe("noncreature spells", () => {
  it("casts destroy removal and moves the target creature to graveyard", () => {
    const game = createInitialGame(content, { seed: "spell-destroy", players: defaultPlayers });
    const player = game.players[0];
    const opponent = game.players[1];
    const removal = findPoolCard(player, "heros_downfall");
    const target = findPoolCard(opponent, "hinterland_sanctifier");
    setHand(player, [removal]);
    opponent.battlefield = [target];
    giveMana(player, "B", 3);
    game.phase = "main1";

    const action = getLegalActions(game, player.playerId).find((candidate) => candidate.type === "castSpell");
    expect(action).toBeDefined();

    performAction(game, action!);
    resolveTopOfStack(game);

    expect(opponent.graveyard.map((instance) => instance.instanceId)).toContain(target.instanceId);
    expect(player.graveyard.map((instance) => instance.instanceId)).toContain(removal.instanceId);
  });

  it("casts a pump trick until end of turn", () => {
    const game = createInitialGame(content, { seed: "spell-pump", players: defaultPlayers });
    const player = game.players[0];
    const trick = findPoolCard(player, "moment_of_triumph");
    const target = findPoolCard(player, "savannah_lions");
    setHand(player, [trick]);
    player.battlefield = [target];
    giveMana(player, "W", 1);
    game.phase = "main1";

    const action = getLegalActions(game, player.playerId).find((candidate) => candidate.type === "castSpell");
    performAction(game, action!);
    resolveTopOfStack(game);

    expect(getCreatureStats(target)).toEqual({ power: 4, toughness: 3 });
    expect(player.lifeTotal).toBe(22);
  });

  it("casts a debuff trick and kills creatures with toughness 0 or less", () => {
    const game = createInitialGame(content, { seed: "spell-debuff", players: defaultPlayers });
    const player = game.players[0];
    const opponent = game.players[1];
    const debuff = findPoolCard(player, "moment_of_craving");
    const target = findPoolCard(opponent, "hinterland_sanctifier");
    setHand(player, [debuff]);
    opponent.battlefield = [target];
    giveMana(player, "B", 2);
    game.phase = "main1";

    const action = getLegalActions(game, player.playerId).find((candidate) => candidate.type === "castSpell");
    performAction(game, action!);
    resolveTopOfStack(game);

    expect(opponent.graveyard.map((instance) => instance.instanceId)).toContain(target.instanceId);
    expect(player.lifeTotal).toBe(22);
  });

  it("casts draw spells", () => {
    const game = createInitialGame(content, { seed: "spell-draw", players: defaultPlayers });
    const player = game.players[1];
    const drawSpell = findPoolCard(player, "opt");
    const handSizeBefore = player.hand.length;
    player.hand = [...player.hand, drawSpell];
    giveMana(player, "U", 1);
    game.phase = "main1";

    const action = getLegalActions(game, player.playerId).find(
      (candidate) => candidate.type === "castSpell" && candidate.cardInstanceId === drawSpell.instanceId,
    );
    performAction(game, action!);
    resolveTopOfStack(game);

    expect(player.hand.length).toBe(handSizeBefore + 1);
    expect(player.graveyard.map((instance) => instance.instanceId)).toContain(drawSpell.instanceId);
  });

  it("AI prioritizes removal over playing a creature", () => {
    const game = createInitialGame(content, { seed: "spell-ai", players: defaultPlayers });
    const player = game.players[0];
    const opponent = game.players[1];
    const removal = findPoolCard(player, "heros_downfall");
    const creature = findPoolCard(player, "savannah_lions");
    const target = findPoolCard(opponent, "hinterland_sanctifier");
    setHand(player, [creature, removal]);
    opponent.battlefield = [target];
    giveMana(player, "B", 3);
    giveMana(player, "W", 1);
    game.phase = "main1";

    const legalActions = getLegalActions(game, player.playerId);
    const action = chooseFirstPlayableCreature(game, player.playerId, legalActions);

    expect(action.type).toBe("castSpell");
    if (action.type !== "castSpell") {
      throw new Error("Expected AI to choose a spell.");
    }
    expect(action.cardInstanceId).toBe(removal.instanceId);
  });

  it("attaches Pacifism persistently and prevents attacking or defending", () => {
    const game = createInitialGame(content, { seed: "aura-pacifism", players: defaultPlayers });
    const player = game.players[0];
    const opponent = game.players[1];
    const aura = findPoolCard(player, "pacifism");
    const target = findPoolCard(opponent, "hinterland_sanctifier");
    setHand(player, [aura]);
    opponent.battlefield = [target];
    giveMana(player, "W", 2);
    game.phase = "main1";
    game.turnNumber = 2;

    const action = getLegalActions(game, player.playerId).find((candidate) => candidate.type === "castSpell");
    performAction(game, action!);
    resolveTopOfStack(game);

    expect(player.battlefield.map((instance) => instance.instanceId)).toContain(aura.instanceId);
    expect(aura.attachedToId).toBe(target.instanceId);
    expect(canAttack(target, game.turnNumber)).toBe(false);
    expect(canDefend(target)).toBe(false);
  });

  it("attaches Untamed Hunger and grants persistent stats plus menace", () => {
    const game = createInitialGame(content, { seed: "aura-hunger", players: defaultPlayers });
    const player = game.players[0];
    const aura = findPoolCard(player, "untamed_hunger");
    const target = findPoolCard(player, "savannah_lions");
    setHand(player, [aura]);
    player.battlefield = [target];
    giveMana(player, "B", 3);
    game.phase = "main1";

    const action = getLegalActions(game, player.playerId).find((candidate) => candidate.type === "castSpell");
    performAction(game, action!);
    resolveTopOfStack(game);

    expect(getCreatureStats(target)).toEqual({ power: 4, toughness: 2 });
    expect(hasKeyword(target, "Menace")).toBe(true);
  });

  it("attaches Eaten by Piranhas and makes the creature a 1/1 without printed abilities", () => {
    const game = createInitialGame(content, { seed: "aura-piranhas", players: defaultPlayers });
    const player = game.players[1];
    const opponent = game.players[0];
    const aura = findPoolCard(player, "eaten_by_piranhas");
    const target = findPoolCard(opponent, "leonin_skyhunter");
    setHand(player, [aura]);
    opponent.battlefield = [target];
    giveMana(player, "U", 2);
    game.phase = "main1";

    const action = getLegalActions(game, player.playerId).find((candidate) => candidate.type === "castSpell");
    performAction(game, action!);
    resolveTopOfStack(game);

    expect(getCreatureStats(target)).toEqual({ power: 1, toughness: 1 });
    expect(hasKeyword(target, "Flying")).toBe(false);
  });

  it("attaches equipment with persistent combat stats", () => {
    const game = createInitialGame(content, { seed: "equipment", players: defaultPlayers });
    const player = game.players[1];
    const equipment = findPoolCard(player, "quick_draw_katana");
    const target = findPoolCard(player, "hinterland_sanctifier");
    setHand(player, [equipment]);
    player.battlefield = [target];
    giveMana(player, "C", 2);
    game.phase = "main1";

    const action = getLegalActions(game, player.playerId).find((candidate) => candidate.type === "castSpell");
    performAction(game, action!);
    resolveTopOfStack(game);

    expect(getCreatureStats(target)).toEqual({ power: 3, toughness: 2 });
    expect(hasKeyword(target, "First strike")).toBe(true);
    expect(equipment.attachedToId).toBe(target.instanceId);
  });

  it("puts +1/+1 counters on creatures permanently", () => {
    const game = createInitialGame(content, {
      seed: "counter",
      players: [
        { id: "player1", archetypeIds: ["elves", "primal"] },
        { id: "player2", archetypeIds: ["healing", "pirates"] },
      ],
    });
    const player = game.players[0];
    const spell = findPoolCard(player, "snakeskin_veil");
    const target = findPoolCard(player, "llanowar_elves");
    setHand(player, [spell]);
    player.battlefield = [target];
    giveMana(player, "G", 1);
    game.phase = "main1";

    const action = getLegalActions(game, player.playerId).find((candidate) => candidate.type === "castSpell");
    performAction(game, action!);
    resolveTopOfStack(game);

    expect(target.plusOneCounters).toBe(1);
    expect(getCreatureStats(target)).toEqual({ power: 2, toughness: 2 });
    expect(player.graveyard.map((instance) => instance.instanceId)).toContain(spell.instanceId);
  });

  it("counters a spell on the stack", () => {
    const game = createInitialGame(content, { seed: "counterspell", players: defaultPlayers });
    const caster = game.players[0];
    const responder = game.players[1];
    const creature = findPoolCard(caster, "savannah_lions");
    const cancel = findPoolCard(responder, "cancel");
    setHand(caster, [creature]);
    setHand(responder, [cancel]);
    giveMana(caster, "W", 1);
    giveMana(responder, "U", 3);
    game.phase = "main1";

    const castCreature = getLegalActions(game, caster.playerId).find((candidate) => candidate.type === "playCreature");
    performAction(game, castCreature!);

    const counterAction = getLegalActions(game, responder.playerId).find((candidate) => candidate.type === "castSpell");
    expect(counterAction).toBeDefined();
    performAction(game, counterAction!);
    resolveTopOfStack(game);

    expect(game.stack).toHaveLength(0);
    expect(caster.battlefield).toHaveLength(0);
    expect(caster.graveyard.map((instance) => instance.instanceId)).toContain(creature.instanceId);
    expect(responder.graveyard.map((instance) => instance.instanceId)).toContain(cancel.instanceId);
  });

  it("requires additional mana costs before casting Eaten Alive", () => {
    const game = createInitialGame(content, {
      seed: "additional-mana",
      players: [
        { id: "player1", archetypeIds: ["undead", "vampires"] },
        { id: "player2", archetypeIds: ["healing", "pirates"] },
      ],
    });
    const player = game.players[0];
    const opponent = game.players[1];
    const spell = findPoolCard(player, "eaten_alive");
    const target = findPoolCard(opponent, "hinterland_sanctifier");
    setHand(player, [spell]);
    opponent.battlefield = [target];
    giveMana(player, "B", 1);
    game.phase = "main1";

    expect(getLegalActions(game, player.playerId).filter((candidate) => candidate.type === "castSpell")).toHaveLength(0);

    giveMana(player, "B", 2);
    giveMana(player, "C", 3);
    const action = getLegalActions(game, player.playerId).find((candidate) => candidate.type === "castSpell");
    expect(action).toBeDefined();
    performAction(game, action!);
    resolveTopOfStack(game);

    expect(opponent.exile.map((instance) => instance.instanceId)).toContain(target.instanceId);
  });

  it("can pay Eaten Alive additional cost by sacrificing a creature", () => {
    const game = createInitialGame(content, {
      seed: "additional-sacrifice",
      players: [
        { id: "player1", archetypeIds: ["undead", "vampires"] },
        { id: "player2", archetypeIds: ["healing", "pirates"] },
      ],
    });
    const player = game.players[0];
    const opponent = game.players[1];
    const spell = findPoolCard(player, "eaten_alive");
    const sacrifice = findPoolCard(player, "diregraf_ghoul");
    const target = findPoolCard(opponent, "hinterland_sanctifier");
    setHand(player, [spell]);
    player.battlefield = [sacrifice];
    opponent.battlefield = [target];
    giveMana(player, "B", 1);
    game.phase = "main1";

    const action = getLegalActions(game, player.playerId).find(
      (candidate) =>
        candidate.type === "castSpell" &&
        candidate.additionalCosts.some((cost) => cost.type === "sacrificeCreature"),
    );
    expect(action).toBeDefined();
    performAction(game, action!);
    resolveTopOfStack(game);

    expect(player.graveyard.map((instance) => instance.instanceId)).toContain(sacrifice.instanceId);
    expect(opponent.exile.map((instance) => instance.instanceId)).toContain(target.instanceId);
  });

  it("pays discard additional costs before resolving draw spells", () => {
    const game = createInitialGame(content, {
      seed: "additional-discard",
      players: [
        { id: "player1", archetypeIds: ["goblins", "inferno"] },
        { id: "player2", archetypeIds: ["healing", "pirates"] },
      ],
    });
    const player = game.players[0];
    const spell = findPoolCard(player, "seize_the_spoils");
    const discard = findPoolCard(player, "goblin_oriflamme");
    setHand(player, [spell, discard]);
    giveMana(player, "R", 3);
    game.phase = "main1";

    const action = getLegalActions(game, player.playerId).find((candidate) => candidate.type === "castSpell");
    performAction(game, action!);
    resolveTopOfStack(game);

    expect(player.graveyard.map((instance) => instance.instanceId)).toEqual(
      expect.arrayContaining([spell.instanceId, discard.instanceId]),
    );
    expect(player.hand.length).toBe(2);
  });

  it("resolves Bite Down with an own creature and an opposing creature target", () => {
    const game = createInitialGame(content, {
      seed: "bite-down",
      players: [
        { id: "player1", archetypeIds: ["elves", "primal"] },
        { id: "player2", archetypeIds: ["healing", "pirates"] },
      ],
    });
    const player = game.players[0];
    const opponent = game.players[1];
    const spell = findPoolCard(player, "bite_down");
    const source = findPoolCard(player, "tajuru_pathwarden");
    const target = findPoolCard(opponent, "hinterland_sanctifier");
    setHand(player, [spell]);
    player.battlefield = [source];
    opponent.battlefield = [target];
    giveMana(player, "G", 2);
    game.phase = "main1";

    const action = getLegalActions(game, player.playerId).find((candidate) => candidate.type === "castSpell");
    expect(action && action.type === "castSpell" ? action.targetIds : []).toHaveLength(2);
    performAction(game, action!);
    resolveTopOfStack(game);

    expect(opponent.graveyard.map((instance) => instance.instanceId)).toContain(target.instanceId);
  });

  it("does not mark negative damage when a creature with negative power deals power damage", () => {
    const game = createInitialGame(content, {
      seed: "bite-down-negative-power",
      players: [
        { id: "player1", archetypeIds: ["elves", "primal"] },
        { id: "player2", archetypeIds: ["healing", "pirates"] },
      ],
    });
    const player = game.players[0];
    const opponent = game.players[1];
    const spell = findPoolCard(player, "bite_down");
    const source = findPoolCard(player, "llanowar_elves");
    const target = findPoolCard(opponent, "hinterland_sanctifier");
    source.powerModifier = -3;
    setHand(player, [spell]);
    player.battlefield = [source];
    opponent.battlefield = [target];
    giveMana(player, "G", 2);
    game.phase = "main1";

    const action = getLegalActions(game, player.playerId).find((candidate) => candidate.type === "castSpell");
    performAction(game, action!);
    resolveTopOfStack(game);

    expect(target.damageMarked).toBe(0);
    expect(opponent.battlefield.map((instance) => instance.instanceId)).toContain(target.instanceId);
  });

  it("resolves Felling Blow counter before its damage", () => {
    const game = createInitialGame(content, {
      seed: "felling-blow",
      players: [
        { id: "player1", archetypeIds: ["elves", "primal"] },
        { id: "player2", archetypeIds: ["healing", "pirates"] },
      ],
    });
    const player = game.players[0];
    const opponent = game.players[1];
    const spell = findPoolCard(player, "felling_blow");
    const source = findPoolCard(player, "llanowar_elves");
    const target = findPoolCard(opponent, "hinterland_sanctifier");
    setHand(player, [spell]);
    player.battlefield = [source];
    opponent.battlefield = [target];
    giveMana(player, "G", 3);
    game.phase = "main1";

    const action = getLegalActions(game, player.playerId).find((candidate) => candidate.type === "castSpell");
    performAction(game, action!);
    resolveTopOfStack(game);

    expect(source.plusOneCounters).toBe(1);
    expect(getCreatureStats(source)).toEqual({ power: 2, toughness: 2 });
    expect(opponent.graveyard.map((instance) => instance.instanceId)).toContain(target.instanceId);
  });
});
