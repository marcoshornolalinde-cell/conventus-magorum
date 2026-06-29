import { describe, expect, it } from "vitest";

import { getLegalActions, performAction, resolveTopOfStack } from "../src/core/actions.js";
import { canAttack, canDefend, getCreatureStats, hasKeyword, resolveCombatPhase } from "../src/core/combat.js";
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
  it("resolves creatures with static entry restrictions", () => {
    const game = createInitialGame(content, { seed: "creature-entry-restrictions", players: defaultPlayers });
    const player = game.players[0];
    const vampire = findPoolCard(player, "vampire_interloper");
    setHand(player, [vampire]);
    giveMana(player, "B", 2);
    game.phase = "main1";

    const action = getLegalActions(game, player.playerId).find((candidate) => candidate.type === "playCreature");
    performAction(game, action!);
    resolveTopOfStack(game);

    expect(vampire.cannotDefend).toBe(true);
    expect(canDefend(vampire)).toBe(false);
  });

  it("resolves creatures that enter tapped", () => {
    const game = createInitialGame(content, {
      seed: "creature-enters-tapped",
      players: [
        { id: "player1", archetypeIds: ["undead", "vampires"] },
        { id: "player2", archetypeIds: ["healing", "pirates"] },
      ],
    });
    const player = game.players[0];
    const ghoul = findPoolCard(player, "diregraf_ghoul");
    setHand(player, [ghoul]);
    giveMana(player, "B", 1);
    game.phase = "main1";

    const action = getLegalActions(game, player.playerId).find((candidate) => candidate.type === "playCreature");
    performAction(game, action!);
    resolveTopOfStack(game);

    expect(ghoul.tapped).toBe(true);
    expect(canDefend(ghoul)).toBe(false);
  });

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

  it("attaches Quick-Draw Katana and applies its bonus while attacking", () => {
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

    expect(getCreatureStats(target)).toEqual({ power: 1, toughness: 2 });
    expect(hasKeyword(target, "First strike")).toBe(false);
    expect(equipment.attachedToId).toBe(target.instanceId);

    game.turnNumber = 2;
    game.attackingPriorityPlayerId = player.playerId;
    resolveCombatPhase(game, (currentGame, playerId) => ({
      playerId,
      attackerIds: playerId === player.playerId ? [target.instanceId] : [],
      defenderIds: [],
    }));

    expect(getCreatureStats(target)).toEqual({ power: 3, toughness: 2 });
    expect(hasKeyword(target, "First strike")).toBe(true);
  });

  it("grants flying to Kitesail Corsair while attacking", () => {
    const game = createInitialGame(content, {
      seed: "kitesail-attacking",
      players: [
        { id: "player1", archetypeIds: ["pirates", "wizards"] },
        { id: "player2", archetypeIds: ["cats", "healing"] },
      ],
    });
    const player = game.players[0];
    const corsair = findPoolCard(player, "kitesail_corsair");
    player.battlefield = [corsair];
    game.turnNumber = 2;
    game.attackingPriorityPlayerId = player.playerId;

    expect(hasKeyword(corsair, "Flying")).toBe(false);

    resolveCombatPhase(game, (currentGame, playerId) => ({
      playerId,
      attackerIds: playerId === player.playerId ? [corsair.instanceId] : [],
      defenderIds: [],
    }));

    expect(hasKeyword(corsair, "Flying")).toBe(true);
  });

  it("applies tribal anthem effects from Corsair Captain", () => {
    const game = createInitialGame(content, {
      seed: "corsair-anthem",
      players: [
        { id: "player1", archetypeIds: ["pirates", "healing"] },
        { id: "player2", archetypeIds: ["cats", "vampires"] },
      ],
    });
    const player = game.players[0];
    const captain = findPoolCard(player, "corsair_captain");
    const pirate = findPoolCard(player, "kitesail_corsair");
    setHand(player, [captain]);
    player.battlefield = [pirate];
    giveMana(player, "U", 3);
    game.phase = "main1";

    const action = getLegalActions(game, player.playerId).find((candidate) => candidate.type === "playCreature");
    performAction(game, action!);
    resolveTopOfStack(game);

    expect(getCreatureStats(captain)).toEqual({ power: 2, toughness: 2 });
    expect(getCreatureStats(pirate)).toEqual({ power: 3, toughness: 2 });
  });

  it("applies Death Baron to skeletons and other zombies", () => {
    const game = createInitialGame(content, {
      seed: "death-baron-anthem",
      players: [
        { id: "player1", archetypeIds: ["undead", "vampires"] },
        { id: "player2", archetypeIds: ["cats", "healing"] },
      ],
    });
    const player = game.players[0];
    const baron = findPoolCard(player, "death_baron");
    const zombie = findPoolCard(player, "diregraf_ghoul");
    const skeleton = findPoolCard(player, "reassembling_skeleton");
    setHand(player, [baron]);
    player.battlefield = [zombie, skeleton];
    giveMana(player, "B", 3);
    game.phase = "main1";

    const action = getLegalActions(game, player.playerId).find((candidate) => candidate.type === "playCreature");
    performAction(game, action!);
    resolveTopOfStack(game);

    expect(getCreatureStats(baron)).toEqual({ power: 2, toughness: 2 });
    expect(getCreatureStats(zombie)).toEqual({ power: 3, toughness: 3 });
    expect(getCreatureStats(skeleton)).toEqual({ power: 2, toughness: 2 });
    expect(hasKeyword(zombie, "Deathtouch")).toBe(true);
    expect(hasKeyword(skeleton, "Deathtouch")).toBe(true);
  });

  it("grants trample to other creatures from Aggressive Mammoth", () => {
    const game = createInitialGame(content, {
      seed: "mammoth-trample",
      players: [
        { id: "player1", archetypeIds: ["primal", "elves"] },
        { id: "player2", archetypeIds: ["cats", "healing"] },
      ],
    });
    const player = game.players[0];
    const mammoth = findPoolCard(player, "aggressive_mammoth");
    const bear = findPoolCard(player, "bear_cub");
    setHand(player, [mammoth]);
    player.battlefield = [bear];
    giveMana(player, "G", 6);
    game.phase = "main1";

    const action = getLegalActions(game, player.playerId).find((candidate) => candidate.type === "playCreature");
    performAction(game, action!);
    resolveTopOfStack(game);

    expect(hasKeyword(mammoth, "Trample")).toBe(true);
    expect(hasKeyword(bear, "Trample")).toBe(true);
  });

  it("reduces Dragon spell costs with Dragonlord's Servant", () => {
    const game = createInitialGame(content, {
      seed: "dragon-cost-reduction",
      players: [
        { id: "player1", archetypeIds: ["inferno", "goblins"] },
        { id: "player2", archetypeIds: ["cats", "healing"] },
      ],
    });
    const player = game.players[0];
    const servant = findPoolCard(player, "dragonlords_servant");
    const dragon = findPoolCard(player, "rapacious_dragon");
    setHand(player, [dragon]);
    player.battlefield = [servant];
    giveMana(player, "R", 1);
    giveMana(player, "C", 3);
    game.phase = "main1";

    const action = getLegalActions(game, player.playerId).find(
      (candidate) => candidate.type === "playCreature" && candidate.cardInstanceId === dragon.instanceId,
    );
    expect(action).toBeDefined();
    performAction(game, action!);

    expect(player.manaPool.R).toBe(0);
    expect(player.manaPool.C).toBe(0);
  });

  it("reduces Tolarian Terror for instant and sorcery cards in graveyard", () => {
    const game = createInitialGame(content, {
      seed: "terror-cost-reduction",
      players: [
        { id: "player1", archetypeIds: ["pirates", "wizards"] },
        { id: "player2", archetypeIds: ["cats", "healing"] },
      ],
    });
    const player = game.players[0];
    const terror = findPoolCard(player, "tolarian_terror");
    const graveyardCards = ["opt", "cancel", "quick_study", "fleeting_distraction"].map((cardId) =>
      findPoolCard(player, cardId),
    );
    player.hand.push(terror);
    player.graveyard.push(...graveyardCards);
    giveMana(player, "U", 1);
    giveMana(player, "C", 2);
    game.phase = "main1";

    const action = getLegalActions(game, player.playerId).find(
      (candidate) => candidate.type === "playCreature" && candidate.cardInstanceId === terror.instanceId,
    );
    expect(action).toBeDefined();
    performAction(game, action!);

    expect(player.manaPool.U).toBe(0);
    expect(player.manaPool.C).toBe(0);
  });

  it("reduces Arcane Epiphany if its controller has a Wizard", () => {
    const game = createInitialGame(content, {
      seed: "epiphany-cost-reduction",
      players: [
        { id: "player1", archetypeIds: ["wizards", "pirates"] },
        { id: "player2", archetypeIds: ["cats", "healing"] },
      ],
    });
    const player = game.players[0];
    const spell = findPoolCard(player, "arcane_epiphany");
    const wizard = findPoolCard(player, "erudite_wizard");
    setHand(player, [spell]);
    player.battlefield = [wizard];
    giveMana(player, "U", 2);
    giveMana(player, "C", 2);
    game.phase = "main1";

    const action = getLegalActions(game, player.playerId).find(
      (candidate) => candidate.type === "castSpell" && candidate.cardInstanceId === spell.instanceId,
    );
    expect(action).toBeDefined();
    performAction(game, action!);

    expect(player.manaPool.U).toBe(0);
    expect(player.manaPool.C).toBe(0);
  });

  it("grants flying to Kargan Dragonrider while controlling a Dragon", () => {
    const game = createInitialGame(content, {
      seed: "kargan-conditional",
      players: [
        { id: "player1", archetypeIds: ["inferno", "goblins"] },
        { id: "player2", archetypeIds: ["cats", "healing"] },
      ],
    });
    const player = game.players[0];
    const dragonrider = findPoolCard(player, "kargan_dragonrider");
    const dragon = findPoolCard(player, "rapacious_dragon");
    setHand(player, [dragonrider]);
    player.battlefield = [dragon];
    giveMana(player, "R", 2);
    game.phase = "main1";

    const action = getLegalActions(game, player.playerId).find(
      (candidate) => candidate.type === "playCreature" && candidate.cardInstanceId === dragonrider.instanceId,
    );
    performAction(game, action!);
    resolveTopOfStack(game);

    expect(hasKeyword(dragonrider, "Flying")).toBe(true);
  });

  it("grants double strike to Twinblade Paladin at 25 life", () => {
    const game = createInitialGame(content, {
      seed: "twinblade-conditional",
      players: [
        { id: "player1", archetypeIds: ["healing", "cats"] },
        { id: "player2", archetypeIds: ["goblins", "inferno"] },
      ],
    });
    const player = game.players[0];
    const paladin = findPoolCard(player, "twinblade_paladin");
    player.lifeTotal = 25;
    setHand(player, [paladin]);
    giveMana(player, "W", 4);
    game.phase = "main1";

    const action = getLegalActions(game, player.playerId).find(
      (candidate) => candidate.type === "playCreature" && candidate.cardInstanceId === paladin.instanceId,
    );
    performAction(game, action!);
    resolveTopOfStack(game);

    expect(hasKeyword(paladin, "Double strike")).toBe(true);
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

  it("returns a nonland permanent with Into the Roil without kicker", () => {
    const game = createInitialGame(content, {
      seed: "into-the-roil",
      players: [
        { id: "player1", archetypeIds: ["wizards", "pirates"] },
        { id: "player2", archetypeIds: ["cats", "healing"] },
      ],
    });
    const player = game.players[0];
    const opponent = game.players[1];
    const spell = findPoolCard(player, "into_the_roil");
    const target = findPoolCard(opponent, "savannah_lions");
    setHand(player, [spell]);
    opponent.battlefield = [target];
    giveMana(player, "U", 2);
    game.phase = "main1";

    const action = getLegalActions(game, player.playerId).find(
      (candidate) => candidate.type === "castSpell" && candidate.additionalCosts.length === 0,
    );
    expect(action).toBeDefined();
    performAction(game, action!);
    resolveTopOfStack(game);

    expect(opponent.battlefield.map((instance) => instance.instanceId)).not.toContain(target.instanceId);
    expect(opponent.hand.map((instance) => instance.instanceId)).toContain(target.instanceId);
    expect(player.hand).toHaveLength(0);
  });

  it("draws a card when Into the Roil is kicked", () => {
    const game = createInitialGame(content, {
      seed: "into-the-roil-kicked",
      players: [
        { id: "player1", archetypeIds: ["wizards", "pirates"] },
        { id: "player2", archetypeIds: ["cats", "healing"] },
      ],
    });
    const player = game.players[0];
    const opponent = game.players[1];
    const spell = findPoolCard(player, "into_the_roil");
    const target = findPoolCard(opponent, "savannah_lions");
    setHand(player, [spell]);
    opponent.battlefield = [target];
    giveMana(player, "U", 4);
    game.phase = "main1";

    const action = getLegalActions(game, player.playerId).find(
      (candidate) => candidate.type === "castSpell" && candidate.additionalCosts.some((cost) => cost.type === "mana"),
    );
    expect(action).toBeDefined();
    performAction(game, action!);
    resolveTopOfStack(game);

    expect(opponent.hand.map((instance) => instance.instanceId)).toContain(target.instanceId);
    expect(player.hand).toHaveLength(1);
    expect(game.events.map((event) => event.type)).toEqual(expect.arrayContaining(["permanentReturnedToHand", "cardDrawn"]));
  });

  it("destroys an artifact, enchantment, or flying creature with Broken Wings", () => {
    const game = createInitialGame(content, {
      seed: "broken-wings",
      players: [
        { id: "player1", archetypeIds: ["elves", "primal"] },
        { id: "player2", archetypeIds: ["cats", "healing"] },
      ],
    });
    const player = game.players[0];
    const opponent = game.players[1];
    const spell = findPoolCard(player, "broken_wings");
    const target = findPoolCard(opponent, "leonin_skyhunter");
    setHand(player, [spell]);
    opponent.battlefield = [target];
    giveMana(player, "G", 3);
    game.phase = "main1";

    const action = getLegalActions(game, player.playerId).find((candidate) => candidate.type === "castSpell");
    expect(action).toBeDefined();
    performAction(game, action!);
    resolveTopOfStack(game);

    expect(opponent.graveyard.map((instance) => instance.instanceId)).toContain(target.instanceId);
    expect(player.graveyard.map((instance) => instance.instanceId)).toContain(spell.instanceId);
  });

  it("exiles a creature that would die from replacement damage this turn", () => {
    const game = createInitialGame(content, {
      seed: "replacement-exile",
      players: [
        { id: "player1", archetypeIds: ["inferno", "goblins"] },
        { id: "player2", archetypeIds: ["cats", "healing"] },
      ],
    });
    const player = game.players[0];
    const opponent = game.players[1];
    const spell = findPoolCard(player, "scorching_dragonfire");
    const target = findPoolCard(opponent, "savannah_lions");
    setHand(player, [spell]);
    opponent.battlefield = [target];
    giveMana(player, "R", 2);
    game.phase = "main1";

    const action = getLegalActions(game, player.playerId).find((candidate) => candidate.type === "castSpell");
    expect(action).toBeDefined();
    performAction(game, action!);
    resolveTopOfStack(game);

    expect(opponent.graveyard.map((instance) => instance.instanceId)).not.toContain(target.instanceId);
    expect(opponent.exile.map((instance) => instance.instanceId)).toContain(target.instanceId);
    expect(game.events.map((event) => event.type)).toContain("permanentExiled");
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

  it("creates creature tokens from Dragon Fodder", () => {
    const game = createInitialGame(content, {
      seed: "dragon-fodder",
      players: [
        { id: "player1", archetypeIds: ["goblins", "inferno"] },
        { id: "player2", archetypeIds: ["healing", "pirates"] },
      ],
    });
    const player = game.players[0];
    const spell = findPoolCard(player, "dragon_fodder");
    setHand(player, [spell]);
    giveMana(player, "R", 2);
    game.phase = "main1";

    const action = getLegalActions(game, player.playerId).find((candidate) => candidate.type === "castSpell");
    performAction(game, action!);
    resolveTopOfStack(game);

    const tokens = player.battlefield.filter((instance) => instance.isToken);
    expect(tokens).toHaveLength(2);
    expect(tokens.every((token) => token.card.name === "Goblin Token")).toBe(true);
    expect(tokens.every((token) => getCreatureStats(token).power === 1 && getCreatureStats(token).toughness === 1)).toBe(true);
    expect(game.events.filter((event) => event.type === "tokenCreated")).toHaveLength(2);
    expect(game.events.filter((event) => event.type === "creatureEntered")).toHaveLength(2);
  });

  it("creates a Treasure token from Seize the Spoils", () => {
    const game = createInitialGame(content, {
      seed: "seize-treasure",
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

    const tokens = player.battlefield.filter((instance) => instance.isToken);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].card.name).toBe("Treasure Token");
    expect(tokens[0].card.cardTypes).toContain("Artifact");
    expect(player.hand).toHaveLength(2);
    expect(game.events.map((event) => event.type)).toEqual(expect.arrayContaining(["cardDiscarded", "cardDrawn", "tokenCreated"]));
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

  it("casts Joraga Invocation as a team pump with trample", () => {
    const game = createInitialGame(content, {
      seed: "joraga-invocation",
      players: [
        { id: "player1", archetypeIds: ["elves", "primal"] },
        { id: "player2", archetypeIds: ["healing", "pirates"] },
      ],
    });
    const player = game.players[0];
    const spell = findPoolCard(player, "joraga_invocation");
    const first = findPoolCard(player, "llanowar_elves");
    const second = findPoolCard(player, "bear_cub");
    setHand(player, [spell]);
    player.battlefield = [first, second];
    giveMana(player, "G", 6);
    game.phase = "main1";

    const action = getLegalActions(game, player.playerId).find((candidate) => candidate.type === "castSpell");
    performAction(game, action!);
    resolveTopOfStack(game);

    expect(getCreatureStats(first)).toEqual({ power: 4, toughness: 4 });
    expect(getCreatureStats(second)).toEqual({ power: 5, toughness: 5 });
    expect(hasKeyword(first, "Trample")).toBe(true);
    expect(hasKeyword(second, "Trample")).toBe(true);
  });
});
