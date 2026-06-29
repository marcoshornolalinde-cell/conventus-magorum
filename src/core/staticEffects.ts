import type { Card, CardInstance, GameState, PlayerState } from "./types.js";

type StaticEffect =
  | {
      type: "anthem";
      power: number;
      toughness: number;
      keywords?: string[];
      target: "otherCreatures" | "otherSubtypeCreatures" | "subtypeCreatures" | "skeletonsAndOtherZombies";
      subtype?: string;
    }
  | {
      type: "attachmentBonus";
      power: number;
      toughness: number;
      keywords?: string[];
    }
  | {
      type: "selfKeywordIfControlSubtype";
      subtype: string;
      keyword: string;
    }
  | {
      type: "selfKeywordIfLifeAtLeast";
      lifeTotal: number;
      keyword: string;
    };

export interface StaticAbilityProfile {
  effects: StaticEffect[];
}

function normalizeText(card: Card): string {
  return card.gameText.replace(/\s+/g, " ").trim();
}

function isCreature(instance: CardInstance): boolean {
  return instance.card.cardTypes.includes("Creature");
}

function hasSubtype(instance: CardInstance, subtype: string): boolean {
  return new RegExp(`\\b${subtype}\\b`, "i").test(instance.card.typeLine);
}

export function getStaticAbilityProfile(card: Card): StaticAbilityProfile | null {
  const text = normalizeText(card);
  const effects: StaticEffect[] = [];
  const hasDeathBaronEffect = /Skeletons you control and other Zombies you control get \+1\/\+1 and have deathtouch/i.test(text);

  const otherSubtypeMatch = hasDeathBaronEffect
    ? null
    : text.match(/Other (\w+) creatures you control get \+(\d+)\/\+(\d+)/i);
  if (otherSubtypeMatch) {
    effects.push({
      type: "anthem",
      target: "otherSubtypeCreatures",
      subtype: otherSubtypeMatch[1],
      power: Number.parseInt(otherSubtypeMatch[2], 10),
      toughness: Number.parseInt(otherSubtypeMatch[3], 10),
    });
  }

  const otherSubtypePermanentMatch = hasDeathBaronEffect
    ? null
    : text.match(/Other (\w+)s you control get \+(\d+)\/\+(\d+)/i);
  if (otherSubtypePermanentMatch) {
    effects.push({
      type: "anthem",
      target: "otherSubtypeCreatures",
      subtype: otherSubtypePermanentMatch[1],
      power: Number.parseInt(otherSubtypePermanentMatch[2], 10),
      toughness: Number.parseInt(otherSubtypePermanentMatch[3], 10),
    });
  }

  if (hasDeathBaronEffect) {
    effects.push({
      type: "anthem",
      target: "skeletonsAndOtherZombies",
      power: 1,
      toughness: 1,
      keywords: ["Deathtouch"],
    });
  }

  if (/Other creatures you control have trample/i.test(text)) {
    effects.push({
      type: "anthem",
      target: "otherCreatures",
      power: 0,
      toughness: 0,
      keywords: ["Trample"],
    });
  }

  const controlSubtypeKeywordMatch = text.match(/As long as you control a (\w+), this creature has (\w+)/i);
  if (controlSubtypeKeywordMatch) {
    effects.push({
      type: "selfKeywordIfControlSubtype",
      subtype: controlSubtypeKeywordMatch[1],
      keyword: controlSubtypeKeywordMatch[2],
    });
  }

  const lifeTotalKeywordMatch = text.match(/As long as you have (\d+) or more life, this creature has double strike/i);
  if (lifeTotalKeywordMatch) {
    effects.push({
      type: "selfKeywordIfLifeAtLeast",
      lifeTotal: Number.parseInt(lifeTotalKeywordMatch[1], 10),
      keyword: "Double strike",
    });
  }

  if (card.id === "untamed_hunger") {
    effects.push({ type: "attachmentBonus", power: 2, toughness: 1, keywords: ["Menace"] });
  }

  if (card.id === "pirates_cutlass") {
    effects.push({ type: "attachmentBonus", power: 2, toughness: 1 });
  }

  return effects.length > 0 ? { effects } : null;
}

function findPermanent(game: GameState, instanceId: string): CardInstance | null {
  for (const player of game.players) {
    const permanent = player.battlefield.find((candidate) => candidate.instanceId === instanceId);

    if (permanent) {
      return permanent;
    }
  }

  return null;
}

function matchesAnthemTarget(source: CardInstance, candidate: CardInstance, effect: Extract<StaticEffect, { type: "anthem" }>): boolean {
  if (!isCreature(candidate)) {
    return false;
  }

  if (effect.target === "otherCreatures") {
    return candidate.instanceId !== source.instanceId;
  }

  if (effect.target === "otherSubtypeCreatures") {
    return candidate.instanceId !== source.instanceId && hasSubtype(candidate, effect.subtype!);
  }

  if (effect.target === "subtypeCreatures") {
    return hasSubtype(candidate, effect.subtype!);
  }

  return hasSubtype(candidate, "Skeleton") || (candidate.instanceId !== source.instanceId && hasSubtype(candidate, "Zombie"));
}

function applyAnthem(source: CardInstance, controller: PlayerState, effect: Extract<StaticEffect, { type: "anthem" }>): void {
  for (const permanent of controller.battlefield) {
    if (!matchesAnthemTarget(source, permanent, effect)) {
      continue;
    }

    permanent.staticPowerModifier += effect.power;
    permanent.staticToughnessModifier += effect.toughness;
    permanent.staticKeywords.push(...(effect.keywords ?? []));
  }
}

function applyAttachmentBonus(game: GameState, source: CardInstance, effect: Extract<StaticEffect, { type: "attachmentBonus" }>): void {
  if (!source.attachedToId) {
    return;
  }

  const target = findPermanent(game, source.attachedToId);

  if (!target || !isCreature(target)) {
    return;
  }

  target.staticPowerModifier += effect.power;
  target.staticToughnessModifier += effect.toughness;
  target.staticKeywords.push(...(effect.keywords ?? []));
}

function applySelfKeywordIfControlSubtype(
  source: CardInstance,
  controller: PlayerState,
  effect: Extract<StaticEffect, { type: "selfKeywordIfControlSubtype" }>,
): void {
  if (controller.battlefield.some((permanent) => hasSubtype(permanent, effect.subtype))) {
    source.staticKeywords.push(effect.keyword);
  }
}

function applySelfKeywordIfLifeAtLeast(
  source: CardInstance,
  controller: PlayerState,
  effect: Extract<StaticEffect, { type: "selfKeywordIfLifeAtLeast" }>,
): void {
  if (controller.lifeTotal >= effect.lifeTotal) {
    source.staticKeywords.push(effect.keyword);
  }
}

export function applyContinuousEffects(game: GameState): void {
  for (const player of game.players) {
    for (const permanent of player.battlefield) {
      permanent.staticPowerModifier = 0;
      permanent.staticToughnessModifier = 0;
      permanent.staticKeywords = [];
    }
  }

  for (const player of game.players) {
    for (const permanent of player.battlefield) {
      const profile = getStaticAbilityProfile(permanent.card);

      if (!profile) {
        continue;
      }

      for (const effect of profile.effects) {
        if (effect.type === "anthem") {
          applyAnthem(permanent, player, effect);
        }

        if (effect.type === "attachmentBonus") {
          applyAttachmentBonus(game, permanent, effect);
        }

        if (effect.type === "selfKeywordIfControlSubtype") {
          applySelfKeywordIfControlSubtype(permanent, player, effect);
        }

        if (effect.type === "selfKeywordIfLifeAtLeast") {
          applySelfKeywordIfLifeAtLeast(permanent, player, effect);
        }
      }
    }
  }
}
