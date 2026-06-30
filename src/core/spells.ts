import type { Card, CardInstance, GameState, PlayerId, PlayerState, StackItem } from "./types.js";
import {
  applyStateBasedActions,
  detachFromPermanent,
  getCreatureStats,
  getCreaturesOnBattlefield,
  hasKeyword,
} from "./combat.js";
import { dispatchGameEvent } from "./triggerEngine.js";

type SpellEffect =
  | { type: "destroyCreature" }
  | { type: "destroyPermanent" }
  | { type: "exileCreature" }
  | { type: "damageCreature"; amount: number }
  | { type: "exileIfWouldDieThisTurn" }
  | { type: "modifyCreature"; power: number; toughness: number }
  | { type: "modifyOwnCreatures"; power: number; toughness: number }
  | { type: "grantKeywords"; keywords: string[] }
  | { type: "grantKeywordsToOwnCreatures"; keywords: string[] }
  | { type: "grantReturnTappedWithCounterOnDeath" }
  | { type: "gainLife"; amount: number }
  | { type: "scry"; amount: number }
  | { type: "drawCards"; amount: number }
  | { type: "optionalDiscardThenDraw" }
  | { type: "drawCardsIfAdditionalManaPaid"; amount: number }
  | { type: "addPlusOneCounters"; amount: number }
  | { type: "distributeCountersThenDouble"; amount: number }
  | {
      type: "createToken";
      count: number;
      token: {
        name: string;
        color: string;
        cardTypes: string[];
        subtypes: string[];
        power: string | null;
        toughness: string | null;
        keywords?: string[];
      };
    }
  | { type: "ownCreatureDealsPowerDamage" }
  | { type: "counterSpell" }
  | { type: "returnPermanentToHand" }
  | { type: "returnGraveyardCreatureToHand"; drawIfSubtype?: string }
  | { type: "destroyCreatureOrReturnZombieFromGraveyardToBattlefieldTapped" }
  | { type: "prayerBinding" }
  | { type: "attachPersistent" };

export interface SpellProfile {
  targetMode:
    | "none"
    | "ownCreature"
    | "opponentCreature"
    | "anyCreature"
    | "opponentNonlandPermanent"
    | "upToOneOpponentNonlandPermanent"
    | "opponentArtifactEnchantmentOrFlyingCreature"
    | "upToThreeOwnCreatures"
    | "stackSpell"
    | "ownLandAndOwnCreature"
    | "ownCreatureCardInGraveyard"
    | "opponentCreatureOrOwnZombieCreatureCardInGraveyard"
    | "ownCreatureAndOpponentCreature";
  effects: SpellEffect[];
}

export function getAdditionalManaCost(card: Card): string {
  const text = normalizeText(card);
  const payMatch = text.match(/As an additional cost to cast this spell, .* or pay (\{[^.]+})/i);
  return payMatch?.[1] ?? "";
}

export function requiresAdditionalDiscard(card: Card): boolean {
  return /As an additional cost to cast this spell, discard a card/i.test(normalizeText(card));
}

function getPlayer(game: GameState, playerId: PlayerId): PlayerState {
  const player = game.players.find((candidate) => candidate.playerId === playerId);

  if (!player) {
    throw new Error(`Unknown player ${playerId}.`);
  }

  return player;
}

function getOpponent(game: GameState, playerId: PlayerId): PlayerState {
  const opponent = game.players.find((candidate) => candidate.playerId !== playerId);

  if (!opponent) {
    throw new Error(`Player ${playerId} has no opponent.`);
  }

  return opponent;
}

function normalizeText(card: Card): string {
  return card.gameText.replace(/\s+/g, " ").trim();
}

function parseSignedNumber(raw: string): number {
  return Number.parseInt(raw.replace("+", ""), 10);
}

function parseDrawAmount(text: string): number {
  if (/Draw three cards/i.test(text)) return 3;
  if (/Draw two cards/i.test(text)) return 2;
  if (/Draw a card/i.test(text)) return 1;
  return 0;
}

function parseGainLifeAmount(text: string): number {
  const match = text.match(/(?:You gain|and you gain) (\d+) life/i);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function parseGrantedKeywords(text: string): string[] {
  const keywords: string[] = [];

  for (const keyword of ["First strike", "Deathtouch", "Indestructible", "Trample", "Lifelink"]) {
    const pattern = new RegExp(`gains? ${keyword}`, "i");

    if (pattern.test(text)) {
      keywords.push(keyword);
    }
  }

  return keywords;
}

function isPersistentAttachment(card: Card): boolean {
  return (
    card.id === "pacifism" ||
    card.id === "untamed_hunger" ||
    card.id === "eaten_by_piranhas" ||
    card.id === "starlight_snare" ||
    card.id === "new_horizons" ||
    card.id === "quick_draw_katana" ||
    card.id === "pirates_cutlass"
  );
}

export function getSpellProfile(card: Card): SpellProfile | null {
  if (card.isLand || card.cardTypes.includes("Creature")) {
    return null;
  }

  const text = normalizeText(card);
  const effects: SpellEffect[] = [];
  let targetMode: SpellProfile["targetMode"] = "none";

  if (card.id === "cemetery_recruitment") {
    return {
      targetMode: "ownCreatureCardInGraveyard",
      effects: [{ type: "returnGraveyardCreatureToHand", drawIfSubtype: "Zombie" }],
    };
  }

  if (card.id === "deadly_plot") {
    return {
      targetMode: "opponentCreatureOrOwnZombieCreatureCardInGraveyard",
      effects: [{ type: "destroyCreatureOrReturnZombieFromGraveyardToBattlefieldTapped" }],
    };
  }

  if (card.id === "prayer_of_binding") {
    return {
      targetMode: "upToOneOpponentNonlandPermanent",
      effects: [{ type: "prayerBinding" }, { type: "gainLife", amount: 2 }],
    };
  }

  if (card.id === "undying_malice") {
    return {
      targetMode: "anyCreature",
      effects: [{ type: "grantReturnTappedWithCounterOnDeath" }],
    };
  }

  if (isPersistentAttachment(card)) {
    effects.push({ type: "attachPersistent" });
    if (card.id === "new_horizons") {
      targetMode = "ownLandAndOwnCreature";
    } else {
      targetMode = card.id === "pacifism" || card.id === "eaten_by_piranhas" || card.id === "starlight_snare"
        ? "opponentCreature"
        : "ownCreature";
    }
  }

  if (/Destroy target creature/i.test(text)) {
    effects.push({ type: "destroyCreature" });
    targetMode = "opponentCreature";
  }

  if (/Destroy target artifact, enchantment, or creature with flying/i.test(text)) {
    effects.push({ type: "destroyPermanent" });
    targetMode = "opponentArtifactEnchantmentOrFlyingCreature";
  }

  if (/Exile target creature/i.test(text)) {
    effects.push({ type: "exileCreature" });
    targetMode = "opponentCreature";
  }

  const damageMatch = text.match(/deals (\d+) damage to target .*creature/i);
  if (damageMatch) {
    if (/If that creature would die this turn, exile it instead/i.test(text)) {
      effects.push({ type: "exileIfWouldDieThisTurn" });
    }
    effects.push({ type: "damageCreature", amount: Number.parseInt(damageMatch[1], 10) });
    targetMode = "opponentCreature";
  }

  const modifyMatch = text.match(/Target creature gets ([+-]\d+)\/([+-]\d+) until end of turn/i);
  if (modifyMatch) {
    const power = parseSignedNumber(modifyMatch[1]);
    const toughness = parseSignedNumber(modifyMatch[2]);
    effects.push({ type: "modifyCreature", power, toughness });
    targetMode = power >= 0 && toughness >= 0 ? "ownCreature" : "opponentCreature";
  }

  const teamPumpMatch = text.match(/Each creature you control gets \+(\d+)\/\+(\d+) and trample until end of turn/i);
  if (teamPumpMatch) {
    effects.push({
      type: "modifyOwnCreatures",
      power: Number.parseInt(teamPumpMatch[1], 10),
      toughness: Number.parseInt(teamPumpMatch[2], 10),
    });
    effects.push({ type: "grantKeywordsToOwnCreatures", keywords: ["Trample"] });
    targetMode = "none";
  }

  const grantedKeywords = parseGrantedKeywords(text);
  if (grantedKeywords.length > 0) {
    effects.push({ type: "grantKeywords", keywords: grantedKeywords });
    targetMode = targetMode === "none" ? "ownCreature" : targetMode;
  }

  const gainLife = parseGainLifeAmount(text);
  if (gainLife > 0) {
    effects.push({ type: "gainLife", amount: gainLife });
  }

  const scryMatch = text.match(/\bScry (\d+)/i);
  if (scryMatch) {
    effects.push({ type: "scry", amount: Number.parseInt(scryMatch[1], 10) });
  }

  const hasConditionalDraw =
    /If this spell was kicked, draw a card/i.test(text) ||
    /\bYou may discard a card\. If you do, draw a card\b/i.test(text);
  const drawCards = hasConditionalDraw ? 0 : parseDrawAmount(text);
  if (drawCards > 0) {
    effects.push({ type: "drawCards", amount: drawCards });
  }

  if (/If this spell was kicked, draw a card/i.test(text)) {
    effects.push({ type: "drawCardsIfAdditionalManaPaid", amount: 1 });
  }

  if (/\bYou may discard a card\. If you do, draw a card\b/i.test(text)) {
    effects.push({ type: "optionalDiscardThenDraw" });
  }

  if (/Return target nonland permanent to its owner's hand/i.test(text)) {
    effects.push({ type: "returnPermanentToHand" });
    targetMode = "opponentNonlandPermanent";
  }

  if (/Create two 1\/1 red Goblin creature tokens/i.test(text)) {
    effects.push({
      type: "createToken",
      count: 2,
      token: {
        name: "Goblin Token",
        color: "Red",
        cardTypes: ["Creature"],
        subtypes: ["Goblin"],
        power: "1",
        toughness: "1",
      },
    });
  }

  if (/create a Treasure token/i.test(text)) {
    effects.push({
      type: "createToken",
      count: 1,
      token: {
        name: "Treasure Token",
        color: "Colorless",
        cardTypes: ["Artifact"],
        subtypes: ["Treasure"],
        power: null,
        toughness: null,
      },
    });
  }

  if (/Put a \+1\/\+1 counter on target creature you control/i.test(text)) {
    effects.push({ type: "addPlusOneCounters", amount: 1 });
    targetMode = targetMode === "none" ? "ownCreature" : targetMode;
  }

  const distributeCountersMatch = text.match(/Distribute (\w+) \+1\/\+1 counters among one, two, or three target creatures/i);
  if (distributeCountersMatch && /\bthen double the number of \+1\/\+1 counters on each of those creatures\b/i.test(text)) {
    effects.push({
      type: "distributeCountersThenDouble",
      amount: distributeCountersMatch[1].toLowerCase() === "three" ? 3 : Number.parseInt(distributeCountersMatch[1], 10),
    });
    targetMode = "upToThreeOwnCreatures";
  }

  if (
    /target creature you control deals damage equal to its power to target creature/i.test(text) ||
    /Then that creature deals damage equal to its power to target creature/i.test(text)
  ) {
    effects.push({ type: "ownCreatureDealsPowerDamage" });
    targetMode = "ownCreatureAndOpponentCreature";
  }

  if (/Counter target spell/i.test(text)) {
    effects.push({ type: "counterSpell" });
    targetMode = "stackSpell";
  }

  if (effects.length === 0) {
    return null;
  }

  return {
    targetMode,
    effects,
  };
}

function isNonlandPermanent(instance: CardInstance): boolean {
  return !instance.card.isLand;
}

function canBeDestroyedByArtifactEnchantmentOrFlyingRemoval(instance: CardInstance): boolean {
  return (
    instance.card.cardTypes.includes("Artifact") ||
    instance.card.cardTypes.includes("Enchantment") ||
    (instance.card.cardTypes.includes("Creature") && hasKeyword(instance, "Flying"))
  );
}

function getTargetableCreatures(game: GameState, controllerId: PlayerId, targetMode: SpellProfile["targetMode"]): CardInstance[] {
  if (
    targetMode === "none" ||
    targetMode === "stackSpell" ||
    targetMode === "ownCreatureAndOpponentCreature" ||
    targetMode === "ownCreatureCardInGraveyard" ||
    targetMode === "opponentCreatureOrOwnZombieCreatureCardInGraveyard"
  ) {
    return [];
  }

  if (targetMode === "ownCreature") {
    return getCreaturesOnBattlefield(getPlayer(game, controllerId));
  }

  if (targetMode === "opponentCreature") {
    return getCreaturesOnBattlefield(getOpponent(game, controllerId));
  }

  if (targetMode === "opponentNonlandPermanent") {
    return getOpponent(game, controllerId).battlefield.filter(isNonlandPermanent);
  }

  if (targetMode === "upToOneOpponentNonlandPermanent") {
    return getOpponent(game, controllerId).battlefield.filter(isNonlandPermanent);
  }

  if (targetMode === "opponentArtifactEnchantmentOrFlyingCreature") {
    return getOpponent(game, controllerId).battlefield.filter(canBeDestroyedByArtifactEnchantmentOrFlyingRemoval);
  }

  return game.players.flatMap((player) => getCreaturesOnBattlefield(player));
}

export function getSpellTargetOptions(game: GameState, controllerId: PlayerId, card: Card): string[][] {
  const profile = getSpellProfile(card);

  if (!profile) {
    return [];
  }

  if (profile.targetMode === "none") {
    return [[]];
  }

  if (profile.targetMode === "upToOneOpponentNonlandPermanent") {
    return [
      [],
      ...getOpponent(game, controllerId).battlefield.filter(isNonlandPermanent).map((target) => [target.instanceId]),
    ];
  }

  if (profile.targetMode === "stackSpell") {
    return game.stack.map((stackItem) => [stackItem.id]);
  }

  if (profile.targetMode === "ownCreatureAndOpponentCreature") {
    const ownCreatures = getCreaturesOnBattlefield(getPlayer(game, controllerId));
    const opponentCreatures = getCreaturesOnBattlefield(getOpponent(game, controllerId));
    return ownCreatures.flatMap((ownCreature) =>
      opponentCreatures.map((opponentCreature) => [ownCreature.instanceId, opponentCreature.instanceId]),
    );
  }

  if (profile.targetMode === "ownLandAndOwnCreature") {
    const player = getPlayer(game, controllerId);
    const ownLands = player.battlefield.filter((permanent) => permanent.card.isLand);
    const ownCreatures = getCreaturesOnBattlefield(player);
    return ownLands.flatMap((land) => ownCreatures.map((creature) => [land.instanceId, creature.instanceId]));
  }

  if (profile.targetMode === "ownCreatureCardInGraveyard") {
    return getPlayer(game, controllerId).graveyard
      .filter((card) => card.card.cardTypes.includes("Creature"))
      .map((card) => [card.instanceId]);
  }

  if (profile.targetMode === "opponentCreatureOrOwnZombieCreatureCardInGraveyard") {
    const opponentCreatures = getCreaturesOnBattlefield(getOpponent(game, controllerId)).map((creature) => [creature.instanceId]);
    const zombieCards = getPlayer(game, controllerId).graveyard
      .filter((card) => card.card.cardTypes.includes("Creature") && hasSubtype(card, "Zombie"))
      .map((card) => [card.instanceId]);
    return [...opponentCreatures, ...zombieCards];
  }

  if (profile.targetMode === "upToThreeOwnCreatures") {
    const ownCreatures = getCreaturesOnBattlefield(getPlayer(game, controllerId));
    const targetOptions: string[][] = [];

    for (let first = 0; first < ownCreatures.length; first += 1) {
      targetOptions.push([ownCreatures[first].instanceId]);

      for (let second = first + 1; second < ownCreatures.length; second += 1) {
        targetOptions.push([ownCreatures[first].instanceId, ownCreatures[second].instanceId]);

        for (let third = second + 1; third < ownCreatures.length; third += 1) {
          targetOptions.push([ownCreatures[first].instanceId, ownCreatures[second].instanceId, ownCreatures[third].instanceId]);
        }
      }
    }

    return targetOptions;
  }

  return getTargetableCreatures(game, controllerId, profile.targetMode).map((target) => [target.instanceId]);
}

function findPermanentController(game: GameState, instanceId: string): PlayerState | null {
  return game.players.find((player) => player.battlefield.some((instance) => instance.instanceId === instanceId)) ?? null;
}

function findPermanent(game: GameState, instanceId: string): CardInstance | null {
  const controller = findPermanentController(game, instanceId);
  return controller?.battlefield.find((instance) => instance.instanceId === instanceId) ?? null;
}

function findGraveyardCardController(game: GameState, instanceId: string): PlayerState | null {
  return game.players.find((player) => player.graveyard.some((instance) => instance.instanceId === instanceId)) ?? null;
}

function findGraveyardCard(game: GameState, instanceId: string): CardInstance | null {
  const controller = findGraveyardCardController(game, instanceId);
  return controller?.graveyard.find((instance) => instance.instanceId === instanceId) ?? null;
}

function hasSubtype(instance: CardInstance, subtype: string): boolean {
  return new RegExp(`\\b${subtype}\\b`, "i").test(instance.card.typeLine) || (instance.additionalSubtypes ?? []).includes(subtype);
}

function resetPermanentForHiddenZone(instance: CardInstance): void {
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
  instance.exiledById = null;
  instance.doesNotUntap = false;
  instance.enteredTurn = null;
  instance.activatedAbilityIdsUsed = [];
  instance.returnTappedWithCounterOnDeathUntilEndOfTurn = false;
}

function resetPermanentForBattlefield(instance: CardInstance, turnNumber: number, tapped: boolean): void {
  instance.tapped = tapped;
  instance.damageMarked = 0;
  instance.deathtouchDamageMarked = 0;
  instance.powerModifier = 0;
  instance.toughnessModifier = 0;
  instance.staticPowerModifier = 0;
  instance.staticToughnessModifier = 0;
  instance.basePowerOverride = null;
  instance.baseToughnessOverride = null;
  instance.staticKeywords = [];
  instance.temporaryKeywords = [];
  instance.additionalSubtypes = [];
  instance.losesAbilities = false;
  instance.cannotAttack = false;
  instance.cannotDefend = false;
  instance.temporaryCannotDefend = false;
  instance.attachedToId = null;
  instance.exiledById = null;
  instance.doesNotUntap = false;
  instance.enteredTurn = turnNumber;
  instance.activatedAbilityIdsUsed = [];
  instance.returnTappedWithCounterOnDeathUntilEndOfTurn = false;
}

function returnCardsExiledBy(game: GameState, sourceId: string): void {
  for (const player of game.players) {
    for (const exiled of [...player.exile]) {
      if (exiled.exiledById !== sourceId) {
        continue;
      }

      player.exile = player.exile.filter((candidate) => candidate.instanceId !== exiled.instanceId);
      resetPermanentForBattlefield(exiled, game.turnNumber, false);
      player.battlefield.push(exiled);
      dispatchGameEvent(game, {
        type: "permanentReturnedToBattlefield",
        playerId: player.playerId,
        sourceId,
        targetId: exiled.instanceId,
        details: { cardId: exiled.card.id, from: "exile" },
      });
    }
  }
}

function returnFromGraveyardTappedWithCounter(game: GameState, instance: CardInstance): void {
  const owner = getPlayer(game, instance.ownerId);
  const graveyardIndex = owner.graveyard.findIndex((candidate) => candidate.instanceId === instance.instanceId);
  const [returned] = graveyardIndex === -1 ? [] : owner.graveyard.splice(graveyardIndex, 1);

  if (!returned) {
    return;
  }

  resetPermanentForBattlefield(returned, game.turnNumber, true);
  returned.plusOneCounters = 1;
  owner.battlefield.push(returned);
  dispatchGameEvent(game, {
    type: "creatureEntered",
    playerId: owner.playerId,
    sourceId: returned.instanceId,
    details: { cardId: returned.card.id, from: "graveyard", tapped: true, plusOneCounter: true },
  });
}

function counterStackItem(game: GameState, stackItemId: string): void {
  const stackIndex = game.stack.findIndex((candidate) => candidate.id === stackItemId);

  if (stackIndex === -1) {
    return;
  }

  const [counteredItem] = game.stack.splice(stackIndex, 1);
  const controller = getPlayer(game, counteredItem.controllerId);
  controller.graveyard.push(counteredItem.source);
  dispatchGameEvent(game, {
    type: "spellCountered",
    playerId: counteredItem.controllerId,
    sourceId: counteredItem.source.instanceId,
    details: { cardId: counteredItem.source.card.id },
  });
  log(game, `${counteredItem.source.card.name} is countered.`);
}

function movePermanentToGraveyard(game: GameState, instanceId: string): void {
  const controller = findPermanentController(game, instanceId);

  if (!controller) {
    return;
  }

  const permanent = controller.battlefield.find((instance) => instance.instanceId === instanceId);

  if (!permanent || hasKeyword(permanent, "Indestructible")) {
    return;
  }

  const shouldReturnTappedWithCounter = permanent.returnTappedWithCounterOnDeathUntilEndOfTurn === true;
  controller.battlefield = controller.battlefield.filter((instance) => instance.instanceId !== instanceId);
  returnCardsExiledBy(game, permanent.instanceId);
  detachFromPermanent(game, permanent.instanceId);
  permanent.tapped = false;
  permanent.damageMarked = 0;
  permanent.deathtouchDamageMarked = 0;
  permanent.powerModifier = 0;
  permanent.toughnessModifier = 0;
  permanent.staticPowerModifier = 0;
  permanent.staticToughnessModifier = 0;
  permanent.basePowerOverride = null;
  permanent.baseToughnessOverride = null;
  permanent.plusOneCounters = 0;
  permanent.staticKeywords = [];
  permanent.temporaryKeywords = [];
  permanent.additionalSubtypes = [];
  permanent.losesAbilities = false;
  permanent.cannotAttack = false;
  permanent.cannotDefend = false;
  permanent.temporaryCannotDefend = false;
  permanent.attachedToId = null;
  permanent.exiledById = null;
  permanent.doesNotUntap = false;
  permanent.activatedAbilityIdsUsed = [];
  permanent.returnTappedWithCounterOnDeathUntilEndOfTurn = false;
  controller.graveyard.push(permanent);
  dispatchGameEvent(game, {
    type: "permanentDied",
    playerId: controller.playerId,
    sourceId: permanent.instanceId,
    details: { cardId: permanent.card.id },
  });

  if (shouldReturnTappedWithCounter) {
    returnFromGraveyardTappedWithCounter(game, permanent);
  }
}

function returnPermanentToHand(game: GameState, source: CardInstance, instanceId: string): void {
  const controller = findPermanentController(game, instanceId);

  if (!controller) {
    return;
  }

  const permanent = controller.battlefield.find((instance) => instance.instanceId === instanceId);

  if (!permanent) {
    return;
  }

  controller.battlefield = controller.battlefield.filter((instance) => instance.instanceId !== instanceId);
  returnCardsExiledBy(game, permanent.instanceId);
  detachFromPermanent(game, permanent.instanceId);
  resetPermanentForHiddenZone(permanent);
  controller.hand.push(permanent);
  dispatchGameEvent(game, {
    type: "permanentReturnedToHand",
    playerId: controller.playerId,
    sourceId: source.instanceId,
    targetId: permanent.instanceId,
    details: { cardId: permanent.card.id },
  });
}

function returnGraveyardCreatureToHand(
  game: GameState,
  controller: PlayerState,
  source: CardInstance,
  instanceId: string,
  drawIfSubtype?: string,
): void {
  const targetIndex = controller.graveyard.findIndex(
    (candidate) => candidate.instanceId === instanceId && candidate.card.cardTypes.includes("Creature"),
  );
  const [returned] = targetIndex === -1 ? [] : controller.graveyard.splice(targetIndex, 1);

  if (!returned) {
    return;
  }

  const shouldDraw = drawIfSubtype ? hasSubtype(returned, drawIfSubtype) : false;
  resetPermanentForHiddenZone(returned);
  controller.hand.push(returned);
  dispatchGameEvent(game, {
    type: "cardReturnedToHand",
    playerId: controller.playerId,
    sourceId: source.instanceId,
    targetId: returned.instanceId,
    details: { cardId: returned.card.id, from: "graveyard" },
  });

  if (shouldDraw) {
    drawCards(game, controller, 1);
  }
}

function returnGraveyardCreatureToBattlefieldTapped(
  game: GameState,
  controller: PlayerState,
  source: CardInstance,
  instanceId: string,
): void {
  const targetIndex = controller.graveyard.findIndex(
    (candidate) => candidate.instanceId === instanceId && candidate.card.cardTypes.includes("Creature"),
  );
  const [returned] = targetIndex === -1 ? [] : controller.graveyard.splice(targetIndex, 1);

  if (!returned) {
    return;
  }

  returned.tapped = true;
  returned.damageMarked = 0;
  returned.deathtouchDamageMarked = 0;
  returned.powerModifier = 0;
  returned.toughnessModifier = 0;
  returned.staticPowerModifier = 0;
  returned.staticToughnessModifier = 0;
  returned.basePowerOverride = null;
  returned.baseToughnessOverride = null;
  returned.staticKeywords = [];
  returned.temporaryKeywords = [];
  returned.additionalSubtypes = [];
  returned.losesAbilities = false;
  returned.cannotAttack = false;
  returned.cannotDefend = false;
  returned.temporaryCannotDefend = false;
  returned.attachedToId = null;
  returned.doesNotUntap = false;
  returned.enteredTurn = game.turnNumber;
  returned.activatedAbilityIdsUsed = [];
  controller.battlefield.push(returned);
  dispatchGameEvent(game, {
    type: "creatureEntered",
    playerId: controller.playerId,
    sourceId: returned.instanceId,
    details: { cardId: returned.card.id, from: "graveyard", tapped: true, spellSourceId: source.instanceId },
  });
}

function movePermanentToExile(game: GameState, instanceId: string): void {
  const controller = findPermanentController(game, instanceId);

  if (!controller) {
    return;
  }

  const permanent = controller.battlefield.find((instance) => instance.instanceId === instanceId);

  if (!permanent) {
    return;
  }

  controller.battlefield = controller.battlefield.filter((instance) => instance.instanceId !== instanceId);
  returnCardsExiledBy(game, permanent.instanceId);
  detachFromPermanent(game, permanent.instanceId);
  permanent.tapped = false;
  permanent.damageMarked = 0;
  permanent.deathtouchDamageMarked = 0;
  permanent.powerModifier = 0;
  permanent.toughnessModifier = 0;
  permanent.staticPowerModifier = 0;
  permanent.staticToughnessModifier = 0;
  permanent.basePowerOverride = null;
  permanent.baseToughnessOverride = null;
  permanent.staticKeywords = [];
  permanent.temporaryKeywords = [];
  permanent.additionalSubtypes = [];
  permanent.losesAbilities = false;
  permanent.cannotAttack = false;
  permanent.cannotDefend = false;
  permanent.temporaryCannotDefend = false;
  permanent.attachedToId = null;
  permanent.exiledById = null;
  permanent.doesNotUntap = false;
  permanent.enteredTurn = null;
  permanent.activatedAbilityIdsUsed = [];
  permanent.returnTappedWithCounterOnDeathUntilEndOfTurn = false;
  controller.exile.push(permanent);
  dispatchGameEvent(game, {
    type: "permanentExiled",
    playerId: controller.playerId,
    sourceId: permanent.instanceId,
    details: { cardId: permanent.card.id },
  });
}

function attachPersistentPermanent(game: GameState, controller: PlayerState, source: CardInstance, target: CardInstance): void {
  source.attachedToId = target.instanceId;
  source.enteredTurn = game.turnNumber;
  source.tapped = false;
  controller.battlefield.push(source);

  if (source.card.id === "pacifism") {
    target.cannotAttack = true;
    target.cannotDefend = true;
  }

  if (source.card.id === "untamed_hunger") {
    target.staticPowerModifier += 2;
    target.staticToughnessModifier += 1;
    target.staticKeywords.push("Menace");
  }

  if (source.card.id === "eaten_by_piranhas") {
    target.losesAbilities = true;
    target.basePowerOverride = 1;
    target.baseToughnessOverride = 1;
  }

  if (source.card.id === "starlight_snare") {
    target.tapped = true;
    target.doesNotUntap = true;
  }

  if (source.card.id === "pirates_cutlass") {
    target.staticPowerModifier += 2;
    target.staticToughnessModifier += 1;
  }

  dispatchGameEvent(game, {
    type: "permanentAttached",
    playerId: controller.playerId,
    sourceId: source.instanceId,
    targetId: target.instanceId,
    details: { cardId: source.card.id },
  });
  log(game, `${source.card.name} attaches to ${target.card.name}.`);
}

function resolvePrayerBinding(game: GameState, controller: PlayerState, source: CardInstance, target: CardInstance | null): void {
  source.enteredTurn = game.turnNumber;
  source.tapped = false;
  source.attachedToId = null;
  controller.battlefield.push(source);

  if (target) {
    const targetController = findPermanentController(game, target.instanceId);

    if (targetController) {
      targetController.battlefield = targetController.battlefield.filter((candidate) => candidate.instanceId !== target.instanceId);
      detachFromPermanent(game, target.instanceId);
      resetPermanentForHiddenZone(target);
      target.exiledById = source.instanceId;
      targetController.exile.push(target);
      dispatchGameEvent(game, {
        type: "permanentExiled",
        playerId: targetController.playerId,
        sourceId: source.instanceId,
        targetId: target.instanceId,
        details: { cardId: target.card.id, untilSourceLeaves: true },
      });
    }
  }

  dispatchGameEvent(game, {
    type: "permanentAttached",
    playerId: controller.playerId,
    sourceId: source.instanceId,
    targetId: target?.instanceId,
    details: { cardId: source.card.id, binding: true },
  });
}

function drawCards(game: GameState, player: PlayerState, amount: number): void {
  for (let index = 0; index < amount; index += 1) {
    const [card, ...remainingDeck] = player.spellDeck;

    if (!card) {
      game.status = "gameOver";
      game.phase = "gameOver";
      game.loserIds = [player.playerId];
      game.winnerId = getOpponent(game, player.playerId).playerId;
      return;
    }

    player.spellDeck = remainingDeck;
    player.hand.push(card);
    player.cardsDrawnThisTurn += 1;
    dispatchGameEvent(game, {
      type: "cardDrawn",
      playerId: player.playerId,
      sourceId: card.instanceId,
      details: { cardId: card.card.id },
    });
  }
}

function optionalDiscardThenDraw(game: GameState, player: PlayerState, source: CardInstance): void {
  const [discarded] = player.hand.splice(0, 1);

  if (!discarded) {
    return;
  }

  resetPermanentForHiddenZone(discarded);
  player.graveyard.push(discarded);
  dispatchGameEvent(game, {
    type: "cardDiscarded",
    playerId: player.playerId,
    sourceId: source.instanceId,
    targetId: discarded.instanceId,
  });
  log(game, `${player.playerId} discards ${discarded.card.name} from ${source.card.name}.`);
  drawCards(game, player, 1);
}

function estimateNextTurnAvailableMana(player: PlayerState): number {
  return player.battlefield.filter((permanent) => permanent.card.isLand).length + 1;
}

function shouldKeepScryCard(player: PlayerState, card: CardInstance): boolean {
  if (card.card.manaValue <= estimateNextTurnAvailableMana(player)) {
    return true;
  }

  if (card.card.cardTypes.includes("Instant") && card.card.manaValue <= estimateNextTurnAvailableMana(player) + 1) {
    return true;
  }

  return false;
}

function scryCards(game: GameState, player: PlayerState, amount: number, source: CardInstance): void {
  for (let index = 0; index < amount; index += 1) {
    const [topCard, ...remainingDeck] = player.spellDeck;

    if (!topCard) {
      return;
    }

    // TODO: Improve this once the AI has a real hand/curve evaluator instead of this simple tempo heuristic.
    if (!shouldKeepScryCard(player, topCard)) {
      player.spellDeck = [...remainingDeck, topCard];
      log(game, `${source.card.name} scries ${topCard.card.name} to the bottom.`);
      continue;
    }

    log(game, `${source.card.name} keeps ${topCard.card.name} on top.`);
    return;
  }
}

function paidAdditionalMana(stackItem: StackItem): boolean {
  return stackItem.additionalCosts.some((cost) => cost.type === "mana" && cost.manaCost.length > 0);
}

function gainLifeFromCreatureDamage(game: GameState, source: CardInstance, damage: number): void {
  if (damage <= 0 || !hasKeyword(source, "Lifelink")) {
    return;
  }

  const controller = getPlayer(game, source.ownerId);
  controller.lifeTotal += damage;
  dispatchGameEvent(game, {
    type: "lifeGained",
    playerId: controller.playerId,
    sourceId: source.instanceId,
    amount: damage,
  });
  log(game, `${controller.playerId} gains ${damage} life from ${source.card.name}.`);
}

function log(game: GameState, message: string): void {
  game.log.push({
    turn: game.turnNumber,
    phase: game.phase,
    message,
  });
}

function addPlusOneCounters(
  game: GameState,
  controller: PlayerState,
  target: CardInstance,
  amount: number,
  source: CardInstance,
): void {
  if (amount <= 0) {
    return;
  }

  target.plusOneCounters += amount;
  dispatchGameEvent(game, {
    type: "plusOneCountersAdded",
    playerId: controller.playerId,
    sourceId: source.instanceId,
    targetId: target.instanceId,
    amount,
    details: { spellSourceId: source.instanceId },
  });
}

function distributeCountersThenDouble(
  game: GameState,
  controller: PlayerState,
  targets: CardInstance[],
  amount: number,
  source: CardInstance,
): void {
  if (targets.length === 0 || amount <= 0) {
    return;
  }

  for (let index = 0; index < amount; index += 1) {
    const target = targets[index % targets.length];
    target.plusOneCounters += 1;
    dispatchGameEvent(game, {
      type: "plusOneCountersAdded",
      playerId: controller.playerId,
      sourceId: source.instanceId,
      targetId: target.instanceId,
      amount: 1,
      details: { spellSourceId: source.instanceId, distributed: true },
    });
  }

  for (const target of targets) {
    const countersToAdd = target.plusOneCounters;

    if (countersToAdd <= 0) {
      continue;
    }

    target.plusOneCounters += countersToAdd;
    dispatchGameEvent(game, {
      type: "plusOneCountersAdded",
      playerId: controller.playerId,
      sourceId: source.instanceId,
      targetId: target.instanceId,
      amount: countersToAdd,
      details: { spellSourceId: source.instanceId, doubled: true },
    });
  }
}

function createToken(
  game: GameState,
  controller: PlayerState,
  source: CardInstance,
  effect: Extract<SpellEffect, { type: "createToken" }>,
): void {
  for (let index = 0; index < effect.count; index += 1) {
    const tokenCard = {
      id: `token:${effect.token.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      name: effect.token.name,
      manaCost: "",
      manaValue: 0,
      colorIdentity: effect.token.color === "Colorless" ? [] : [effect.token.color],
      colorNames: effect.token.color === "Colorless" ? [] : [effect.token.color],
      typeLine: `Token ${effect.token.cardTypes.join(" ")}${effect.token.subtypes.length > 0 ? ` - ${effect.token.subtypes.join(" ")}` : ""}`,
      cardTypes: effect.token.cardTypes,
      isLand: false,
      isBasicLand: false,
      landMana: null,
      power: effect.token.power,
      toughness: effect.token.toughness,
      keywords: effect.token.keywords ?? [],
      keywordIds: [],
      oracleText: "",
      gameText: "",
    };
    const token: CardInstance = {
      instanceId: `${source.instanceId}:token:${game.events.length}:${index}`,
      ownerId: controller.playerId,
      sourceArchetypeId: source.sourceArchetypeId,
      card: tokenCard,
      isToken: true,
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
      additionalSubtypes: [],
      losesAbilities: false,
      cannotAttack: false,
      cannotDefend: false,
      temporaryCannotDefend: false,
      attachedToId: null,
      doesNotUntap: false,
      enteredTurn: game.turnNumber,
      activatedAbilityIdsUsed: [],
    };

    controller.battlefield.push(token);
    dispatchGameEvent(game, {
      type: "tokenCreated",
      playerId: controller.playerId,
      sourceId: source.instanceId,
      targetId: token.instanceId,
      details: { tokenName: effect.token.name },
    });

    if (token.card.cardTypes.includes("Creature")) {
      dispatchGameEvent(game, {
        type: "creatureEntered",
        playerId: controller.playerId,
        sourceId: token.instanceId,
        details: { cardId: token.card.id, token: true },
      });
    }
  }
}

export function resolveNonCreatureSpell(game: GameState, stackItem: StackItem): void {
  const controller = getPlayer(game, stackItem.controllerId);
  const profile = getSpellProfile(stackItem.source.card);

  if (!profile) {
    controller.graveyard.push(stackItem.source);
    return;
  }

  const target = stackItem.targetIds[0] ? findPermanent(game, stackItem.targetIds[0]) : null;
  const graveyardTarget = stackItem.targetIds[0] ? findGraveyardCard(game, stackItem.targetIds[0]) : null;
  const secondTarget = stackItem.targetIds[1] ? findPermanent(game, stackItem.targetIds[1]) : null;
  const targets = stackItem.targetIds
    .map((targetId) => findPermanent(game, targetId))
    .filter((candidate): candidate is CardInstance => candidate !== null);

  for (const effect of profile.effects) {
    if (effect.type === "destroyCreature" && target) {
      movePermanentToGraveyard(game, target.instanceId);
      log(game, `${stackItem.source.card.name} destroys ${target.card.name}.`);
    }

    if (effect.type === "destroyPermanent" && target) {
      movePermanentToGraveyard(game, target.instanceId);
      log(game, `${stackItem.source.card.name} destroys ${target.card.name}.`);
    }

    if (effect.type === "exileCreature" && target) {
      movePermanentToExile(game, target.instanceId);
      log(game, `${stackItem.source.card.name} exiles ${target.card.name}.`);
    }

    if (effect.type === "exileIfWouldDieThisTurn" && target) {
      game.exileOnDeathUntilEndOfTurn = Array.from(
        new Set([...game.exileOnDeathUntilEndOfTurn, target.instanceId]),
      );
    }

    if (effect.type === "damageCreature" && target) {
      target.damageMarked += effect.amount;
      dispatchGameEvent(game, {
        type: "damageDealt",
        playerId: controller.playerId,
        sourceId: stackItem.source.instanceId,
        targetId: target.instanceId,
        amount: effect.amount,
        details: { targetType: "creature" },
      });
      log(game, `${stackItem.source.card.name} deals ${effect.amount} damage to ${target.card.name}.`);
      applyStateBasedActions(game);
    }

    if (effect.type === "modifyCreature" && target) {
      target.powerModifier += effect.power;
      target.toughnessModifier += effect.toughness;
      log(game, `${stackItem.source.card.name} modifies ${target.card.name} by ${effect.power}/${effect.toughness}.`);
      applyStateBasedActions(game);
    }

    if (effect.type === "modifyOwnCreatures") {
      for (const creature of getCreaturesOnBattlefield(controller)) {
        creature.powerModifier += effect.power;
        creature.toughnessModifier += effect.toughness;
      }
      log(game, `${stackItem.source.card.name} modifies ${controller.playerId}'s creatures by ${effect.power}/${effect.toughness}.`);
      applyStateBasedActions(game);
    }

    if (effect.type === "grantKeywords" && target) {
      target.temporaryKeywords.push(...effect.keywords);
      log(game, `${stackItem.source.card.name} grants ${effect.keywords.join(", ")} to ${target.card.name}.`);
    }

    if (effect.type === "grantReturnTappedWithCounterOnDeath" && target) {
      target.returnTappedWithCounterOnDeathUntilEndOfTurn = true;
      log(game, `${stackItem.source.card.name} grants a death return trigger to ${target.card.name}.`);
    }

    if (effect.type === "grantKeywordsToOwnCreatures") {
      for (const creature of getCreaturesOnBattlefield(controller)) {
        creature.temporaryKeywords.push(...effect.keywords);
      }
      log(game, `${stackItem.source.card.name} grants ${effect.keywords.join(", ")} to ${controller.playerId}'s creatures.`);
    }

    if (effect.type === "gainLife") {
      controller.lifeTotal += effect.amount;
      dispatchGameEvent(game, {
        type: "lifeGained",
        playerId: controller.playerId,
        sourceId: stackItem.source.instanceId,
        amount: effect.amount,
      });
      log(game, `${controller.playerId} gains ${effect.amount} life from ${stackItem.source.card.name}.`);
    }

    if (effect.type === "scry") {
      scryCards(game, controller, effect.amount, stackItem.source);
    }

    if (effect.type === "drawCards") {
      drawCards(game, controller, effect.amount);
      log(game, `${controller.playerId} draws ${effect.amount} card(s) from ${stackItem.source.card.name}.`);
    }

    if (effect.type === "optionalDiscardThenDraw") {
      optionalDiscardThenDraw(game, controller, stackItem.source);
    }

    if (effect.type === "drawCardsIfAdditionalManaPaid" && paidAdditionalMana(stackItem)) {
      drawCards(game, controller, effect.amount);
      log(game, `${controller.playerId} draws ${effect.amount} kicked card(s) from ${stackItem.source.card.name}.`);
    }

    if (effect.type === "addPlusOneCounters" && (target || secondTarget)) {
      const counterTarget = profile.targetMode === "ownLandAndOwnCreature" ? secondTarget : target;

      if (!counterTarget) {
        continue;
      }

      addPlusOneCounters(game, controller, counterTarget, effect.amount, stackItem.source);
      log(game, `${stackItem.source.card.name} puts ${effect.amount} +1/+1 counter(s) on ${counterTarget.card.name}.`);
      applyStateBasedActions(game);
    }

    if (effect.type === "distributeCountersThenDouble") {
      distributeCountersThenDouble(game, controller, targets, effect.amount, stackItem.source);
      log(game, `${stackItem.source.card.name} distributes and doubles +1/+1 counters.`);
      applyStateBasedActions(game);
    }

    if (effect.type === "createToken") {
      createToken(game, controller, stackItem.source, effect);
      log(game, `${stackItem.source.card.name} creates ${effect.count} token(s).`);
    }

    if (effect.type === "ownCreatureDealsPowerDamage" && target && secondTarget) {
      const damage = Math.max(0, getCreatureStats(target).power);
      secondTarget.damageMarked += damage;
      if (damage > 0 && hasKeyword(target, "Deathtouch")) {
        secondTarget.deathtouchDamageMarked += damage;
      }
      gainLifeFromCreatureDamage(game, target, damage);
      dispatchGameEvent(game, {
        type: "damageDealt",
        playerId: target.ownerId,
        sourceId: target.instanceId,
        targetId: secondTarget.instanceId,
        amount: damage,
        details: { sourceSpellId: stackItem.source.instanceId, targetType: "creature" },
      });
      log(game, `${target.card.name} deals ${damage} damage to ${secondTarget.card.name} from ${stackItem.source.card.name}.`);
      applyStateBasedActions(game);
    }

    if (effect.type === "counterSpell" && stackItem.targetIds[0]) {
      counterStackItem(game, stackItem.targetIds[0]);
    }

    if (effect.type === "returnPermanentToHand" && target) {
      returnPermanentToHand(game, stackItem.source, target.instanceId);
      log(game, `${stackItem.source.card.name} returns ${target.card.name} to hand.`);
    }

    if (effect.type === "returnGraveyardCreatureToHand" && graveyardTarget) {
      returnGraveyardCreatureToHand(game, controller, stackItem.source, graveyardTarget.instanceId, effect.drawIfSubtype);
      log(game, `${stackItem.source.card.name} returns ${graveyardTarget.card.name} from graveyard to hand.`);
    }

    if (effect.type === "destroyCreatureOrReturnZombieFromGraveyardToBattlefieldTapped") {
      if (target) {
        movePermanentToGraveyard(game, target.instanceId);
        log(game, `${stackItem.source.card.name} destroys ${target.card.name}.`);
      } else if (graveyardTarget && hasSubtype(graveyardTarget, "Zombie")) {
        returnGraveyardCreatureToBattlefieldTapped(game, controller, stackItem.source, graveyardTarget.instanceId);
        log(game, `${stackItem.source.card.name} returns ${graveyardTarget.card.name} tapped from graveyard.`);
      }
    }

    if (effect.type === "attachPersistent" && target) {
      attachPersistentPermanent(game, controller, stackItem.source, target);
    }

    if (effect.type === "prayerBinding") {
      resolvePrayerBinding(game, controller, stackItem.source, target);
    }
  }

  if (!controller.battlefield.some((instance) => instance.instanceId === stackItem.source.instanceId)) {
    controller.graveyard.push(stackItem.source);
  }
}
