import type { Card, CardInstance, GameState, PlayerId, PlayerState, StackItem } from "./types.js";
import {
  applyStateBasedActions,
  detachFromPermanent,
  getCreatureStats,
  getCreaturesOnBattlefield,
  hasKeyword,
} from "./combat.js";

type SpellEffect =
  | { type: "destroyCreature" }
  | { type: "exileCreature" }
  | { type: "damageCreature"; amount: number }
  | { type: "modifyCreature"; power: number; toughness: number }
  | { type: "grantKeywords"; keywords: string[] }
  | { type: "gainLife"; amount: number }
  | { type: "drawCards"; amount: number }
  | { type: "addPlusOneCounters"; amount: number }
  | { type: "ownCreatureDealsPowerDamage" }
  | { type: "counterSpell" }
  | { type: "attachPersistent" };

export interface SpellProfile {
  targetMode:
    | "none"
    | "ownCreature"
    | "opponentCreature"
    | "anyCreature"
    | "stackSpell"
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

  if (isPersistentAttachment(card)) {
    effects.push({ type: "attachPersistent" });
    targetMode = card.id === "pacifism" || card.id === "eaten_by_piranhas" || card.id === "starlight_snare"
      ? "opponentCreature"
      : "ownCreature";
  }

  if (/Destroy target creature/i.test(text)) {
    effects.push({ type: "destroyCreature" });
    targetMode = "opponentCreature";
  }

  if (/Exile target creature/i.test(text)) {
    effects.push({ type: "exileCreature" });
    targetMode = "opponentCreature";
  }

  const damageMatch = text.match(/deals (\d+) damage to target .*creature/i);
  if (damageMatch) {
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

  const grantedKeywords = parseGrantedKeywords(text);
  if (grantedKeywords.length > 0) {
    effects.push({ type: "grantKeywords", keywords: grantedKeywords });
    targetMode = targetMode === "none" ? "ownCreature" : targetMode;
  }

  const gainLife = parseGainLifeAmount(text);
  if (gainLife > 0) {
    effects.push({ type: "gainLife", amount: gainLife });
  }

  const drawCards = parseDrawAmount(text);
  if (drawCards > 0) {
    effects.push({ type: "drawCards", amount: drawCards });
  }

  if (/Put a \+1\/\+1 counter on target creature you control/i.test(text)) {
    effects.push({ type: "addPlusOneCounters", amount: 1 });
    targetMode = targetMode === "none" ? "ownCreature" : targetMode;
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

function getTargetableCreatures(game: GameState, controllerId: PlayerId, targetMode: SpellProfile["targetMode"]): CardInstance[] {
  if (targetMode === "none" || targetMode === "stackSpell" || targetMode === "ownCreatureAndOpponentCreature") {
    return [];
  }

  if (targetMode === "ownCreature") {
    return getCreaturesOnBattlefield(getPlayer(game, controllerId));
  }

  if (targetMode === "opponentCreature") {
    return getCreaturesOnBattlefield(getOpponent(game, controllerId));
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

  return getTargetableCreatures(game, controllerId, profile.targetMode).map((target) => [target.instanceId]);
}

function findPermanentController(game: GameState, instanceId: string): PlayerState | null {
  return game.players.find((player) => player.battlefield.some((instance) => instance.instanceId === instanceId)) ?? null;
}

function findPermanent(game: GameState, instanceId: string): CardInstance | null {
  const controller = findPermanentController(game, instanceId);
  return controller?.battlefield.find((instance) => instance.instanceId === instanceId) ?? null;
}

function counterStackItem(game: GameState, stackItemId: string): void {
  const stackIndex = game.stack.findIndex((candidate) => candidate.id === stackItemId);

  if (stackIndex === -1) {
    return;
  }

  const [counteredItem] = game.stack.splice(stackIndex, 1);
  const controller = getPlayer(game, counteredItem.controllerId);
  controller.graveyard.push(counteredItem.source);
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

  controller.battlefield = controller.battlefield.filter((instance) => instance.instanceId !== instanceId);
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
  permanent.losesAbilities = false;
  permanent.cannotAttack = false;
  permanent.cannotDefend = false;
  permanent.attachedToId = null;
  permanent.doesNotUntap = false;
  controller.graveyard.push(permanent);
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
  permanent.losesAbilities = false;
  permanent.cannotAttack = false;
  permanent.cannotDefend = false;
  permanent.attachedToId = null;
  permanent.doesNotUntap = false;
  controller.exile.push(permanent);
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

  if (source.card.id === "quick_draw_katana") {
    target.staticPowerModifier += 2;
    target.staticKeywords.push("First strike");
  }

  if (source.card.id === "pirates_cutlass") {
    target.staticPowerModifier += 2;
    target.staticToughnessModifier += 1;
  }

  log(game, `${source.card.name} attaches to ${target.card.name}.`);
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
  }
}

function gainLifeFromCreatureDamage(game: GameState, source: CardInstance, damage: number): void {
  if (damage <= 0 || !hasKeyword(source, "Lifelink")) {
    return;
  }

  const controller = getPlayer(game, source.ownerId);
  controller.lifeTotal += damage;
  log(game, `${controller.playerId} gains ${damage} life from ${source.card.name}.`);
}

function log(game: GameState, message: string): void {
  game.log.push({
    turn: game.turnNumber,
    phase: game.phase,
    message,
  });
}

export function resolveNonCreatureSpell(game: GameState, stackItem: StackItem): void {
  const controller = getPlayer(game, stackItem.controllerId);
  const profile = getSpellProfile(stackItem.source.card);

  if (!profile) {
    controller.graveyard.push(stackItem.source);
    return;
  }

  const target = stackItem.targetIds[0] ? findPermanent(game, stackItem.targetIds[0]) : null;
  const secondTarget = stackItem.targetIds[1] ? findPermanent(game, stackItem.targetIds[1]) : null;

  for (const effect of profile.effects) {
    if (effect.type === "destroyCreature" && target) {
      movePermanentToGraveyard(game, target.instanceId);
      log(game, `${stackItem.source.card.name} destroys ${target.card.name}.`);
    }

    if (effect.type === "exileCreature" && target) {
      movePermanentToExile(game, target.instanceId);
      log(game, `${stackItem.source.card.name} exiles ${target.card.name}.`);
    }

    if (effect.type === "damageCreature" && target) {
      target.damageMarked += effect.amount;
      log(game, `${stackItem.source.card.name} deals ${effect.amount} damage to ${target.card.name}.`);
      applyStateBasedActions(game);
    }

    if (effect.type === "modifyCreature" && target) {
      target.powerModifier += effect.power;
      target.toughnessModifier += effect.toughness;
      log(game, `${stackItem.source.card.name} modifies ${target.card.name} by ${effect.power}/${effect.toughness}.`);
      applyStateBasedActions(game);
    }

    if (effect.type === "grantKeywords" && target) {
      target.temporaryKeywords.push(...effect.keywords);
      log(game, `${stackItem.source.card.name} grants ${effect.keywords.join(", ")} to ${target.card.name}.`);
    }

    if (effect.type === "gainLife") {
      controller.lifeTotal += effect.amount;
      log(game, `${controller.playerId} gains ${effect.amount} life from ${stackItem.source.card.name}.`);
    }

    if (effect.type === "drawCards") {
      drawCards(game, controller, effect.amount);
      log(game, `${controller.playerId} draws ${effect.amount} card(s) from ${stackItem.source.card.name}.`);
    }

    if (effect.type === "addPlusOneCounters" && target) {
      target.plusOneCounters += effect.amount;
      log(game, `${stackItem.source.card.name} puts ${effect.amount} +1/+1 counter(s) on ${target.card.name}.`);
      applyStateBasedActions(game);
    }

    if (effect.type === "ownCreatureDealsPowerDamage" && target && secondTarget) {
      const damage = getCreatureStats(target).power;
      secondTarget.damageMarked += damage;
      if (hasKeyword(target, "Deathtouch")) {
        secondTarget.deathtouchDamageMarked += damage;
      }
      gainLifeFromCreatureDamage(game, target, damage);
      log(game, `${target.card.name} deals ${damage} damage to ${secondTarget.card.name} from ${stackItem.source.card.name}.`);
      applyStateBasedActions(game);
    }

    if (effect.type === "counterSpell" && stackItem.targetIds[0]) {
      counterStackItem(game, stackItem.targetIds[0]);
    }

    if (effect.type === "attachPersistent" && target) {
      attachPersistentPermanent(game, controller, stackItem.source, target);
    }
  }

  if (!controller.battlefield.some((instance) => instance.instanceId === stackItem.source.instanceId)) {
    controller.graveyard.push(stackItem.source);
  }
}
