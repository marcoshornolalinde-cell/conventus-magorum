import type { Card, ContentBundle } from "../core/types.js";
import { getSpellProfile } from "../core/spells.js";
import { getTriggeredAbilityProfiles } from "../core/triggerEngine.js";
import { getStaticAbilityProfile } from "../core/staticEffects.js";

export interface UnsupportedMechanicFinding {
  cardId: string;
  cardName: string;
  typeLine: string;
  unsupported: string[];
  text: string;
}

export interface MechanicsAudit {
  totalCards: number;
  cardsWithText: number;
  unsupportedCards: UnsupportedMechanicFinding[];
  unsupportedCounts: Record<string, number>;
}

const unsupportedPatterns: Array<{ label: string; pattern: RegExp }> = [
  { label: "triggered ability", pattern: /\b(when|whenever|at the beginning|at the end)\b/i },
  { label: "activated ability", pattern: /(?:^|\s)(?:\{[^}]+})(?:\{[^}]+})*(?:,\s*(?:\{T}|\{[^}]+}|sacrifice [^:]+))*\s*:/i },
  { label: "token creation", pattern: /\bcreate\b.+\btoken/i },
  { label: "return from battlefield/yard", pattern: /\breturn\b.+\b(?:hand|battlefield|graveyard)\b/i },
  { label: "mill", pattern: /\bmill\b/i },
  { label: "scry", pattern: /\bscry\b/i },
  { label: "kicker", pattern: /\bkicker\b/i },
  { label: "ward", pattern: /\bward\b/i },
  { label: "cost reduction", pattern: /\bcosts? \{?\d?}? less\b/i },
  { label: "modal choice", pattern: /\bchoose one\b/i },
  { label: "replacement effect", pattern: /\binstead\b/i },
  { label: "until leaves battlefield", pattern: /\buntil .* leaves the battlefield\b/i },
  { label: "static anthem", pattern: /\b(other|attacking|equipped|skeletons|zombies|pirates|goblins|vampires).+get[s]? [+-]\d\/[+-]\d/i },
  { label: "team pump", pattern: /\b(each|attacking) creatures? you control gets? [+-]\d\/[+-]\d/i },
  { label: "static keyword grant", pattern: /\b(other )?creatures you control have\b/i },
  { label: "conditional static ability", pattern: /\bas long as\b|\bas long\b|\bwhile it's attacking\b/i },
  { label: "can't be blocked", pattern: /\bcan't be blocked\b/i },
  { label: "can't defend", pattern: /\bcan't defend\b/i },
  { label: "enters tapped", pattern: /\benters tapped\b/i },
  { label: "expanded target removal", pattern: /\bdestroy target (?:artifact|enchantment|creature with flying|artifact, enchantment, or creature with flying)\b/i },
  { label: "must be blocked", pattern: /\bmust be assigned a blocker\b/i },
  { label: "counter distribution", pattern: /\bdistribute .* \+1\/\+1 counters\b|\bdouble the number of \+1\/\+1 counters\b/i },
  { label: "type-changing effect", pattern: /\bbecomes? an? \w+/i },
  { label: "graveyard ability", pattern: /\bfrom your graveyard\b|\bexile this card from your graveyard\b/i },
  { label: "optional payment", pattern: /\byou may pay\b|\byou may discard\b/i },
  { label: "enchanted land mana ability", pattern: /\bEnchanted land has\b/i },
];

function normalizeText(card: Card): string {
  return card.gameText.replace(/\s+/g, " ").trim();
}

function hasOnlySupportedPrintedKeywords(card: Card, text: string): boolean {
  if (!card.cardTypes.includes("Creature")) {
    return false;
  }

  const keywordPattern =
    /^(?:(?:Flying|Vigilance|Lifelink|First strike|Double strike|Trample|Deathtouch|Haste|Reach)(?: \([^)]*\))?\s*)+$/i;
  return keywordPattern.test(text);
}

function isSupportedNonCreatureSpell(card: Card): boolean {
  return getSpellProfile(card) !== null;
}

function supportedLabelsForCard(card: Card): Set<string> {
  const labels = new Set<string>();
  const supportedTriggers = getTriggeredAbilityProfiles(card);
  const spellProfile = getSpellProfile(card);
  const staticProfile = getStaticAbilityProfile(card);

  if (supportedTriggers.length > 0) {
    labels.add("triggered ability");
  }

  if (
    spellProfile?.effects.some((effect) => effect.type === "attachPersistent") &&
    /\bWhen this (?:Aura|Equipment) enters\b/i.test(normalizeText(card))
  ) {
    labels.add("triggered ability");
  }

  if (
    spellProfile?.effects.some((effect) => effect.type === "addPlusOneCounters") &&
    /\bWhen this Aura enters, put a \+1\/\+1 counter\b/i.test(normalizeText(card))
  ) {
    labels.add("triggered ability");
  }

  if (spellProfile?.effects.some((effect) => effect.type === "modifyOwnCreatures")) {
    labels.add("team pump");
  }

  if (spellProfile?.effects.some((effect) => effect.type === "createToken")) {
    labels.add("token creation");
  }

  if (spellProfile?.effects.some((effect) => effect.type === "returnPermanentToHand")) {
    labels.add("return from battlefield/yard");
  }

  if (spellProfile?.effects.some((effect) => effect.type === "destroyPermanent")) {
    labels.add("expanded target removal");
  }

  if (spellProfile?.effects.some((effect) => effect.type === "drawCardsIfAdditionalManaPaid")) {
    labels.add("kicker");
    labels.add("optional payment");
  }

  if (spellProfile?.effects.some((effect) => effect.type === "exileIfWouldDieThisTurn")) {
    labels.add("replacement effect");
  }

  if (staticProfile?.effects.some((effect) => effect.type === "anthem" || effect.type === "attachmentBonus")) {
    labels.add("static anthem");
  }

  if (
    staticProfile?.effects.some(
      (effect) =>
        ((effect.type === "anthem" || effect.type === "attachmentBonus") && (effect.keywords?.length ?? 0) > 0) ||
        effect.type === "selfKeywordIfControlSubtype" ||
        effect.type === "selfKeywordIfLifeAtLeast",
    )
  ) {
    labels.add("static keyword grant");
  }

  if (
    staticProfile?.effects.some(
      (effect) => effect.type === "selfKeywordIfControlSubtype" || effect.type === "selfKeywordIfLifeAtLeast",
    )
  ) {
    labels.add("conditional static ability");
  }

  if (/\bThis creature has flying as long as it's attacking\b/i.test(normalizeText(card))) {
    labels.add("conditional static ability");
  }

  if (/\bEquipped creature gets \+2\/\+0 and has first strike while it's attacking\b/i.test(normalizeText(card))) {
    labels.add("conditional static ability");
    labels.add("static anthem");
  }

  if (
    /\bDragon spells you cast cost \{1} less to cast\b/i.test(normalizeText(card)) ||
    /\bThis spell costs \{1} less to cast for each instant and sorcery card in your graveyard\b/i.test(normalizeText(card)) ||
    /\bThis spell costs \{1} less to cast if you control a Wizard\b/i.test(normalizeText(card))
  ) {
    labels.add("cost reduction");
  }

  if (card.cardTypes.includes("Creature") && /\bcan't defend\b/i.test(normalizeText(card))) {
    labels.add("can't defend");
  }

  if (card.cardTypes.includes("Creature") && /\benters tapped\b/i.test(normalizeText(card))) {
    labels.add("enters tapped");
  }

  if (supportedTriggers.some((profile) => profile.effects.some((effect) => effect.type === "createToken"))) {
    labels.add("token creation");
  }

  if (supportedTriggers.some((profile) => profile.effects.some((effect) => effect.type === "millCards"))) {
    labels.add("mill");
  }

  if (
    supportedTriggers.some((profile) =>
      profile.effects.some((effect) => effect.type === "returnOwnPermanentFromGraveyardToHand"),
    )
  ) {
    labels.add("return from battlefield/yard");
    labels.add("graveyard ability");
  }

  if (supportedTriggers.some((profile) => profile.effects.some((effect) => effect.type === "returnToHand"))) {
    labels.add("return from battlefield/yard");
  }

  return labels;
}

export function auditUnsupportedMechanics(bundle: ContentBundle): MechanicsAudit {
  const unsupportedCards: UnsupportedMechanicFinding[] = [];
  const unsupportedCounts: Record<string, number> = {};

  for (const card of bundle.cards) {
    const text = normalizeText(card);

    if (!text || card.isLand) {
      continue;
    }

    const supportedLabels = supportedLabelsForCard(card);
    const unsupported = unsupportedPatterns
      .filter(({ pattern }) => pattern.test(text))
      .map(({ label }) => label)
      .filter((label) => !supportedLabels.has(label));

    if (
      unsupported.length === 0 &&
      (hasOnlySupportedPrintedKeywords(card, text) || isSupportedNonCreatureSpell(card) || supportedLabels.size > 0)
    ) {
      continue;
    }

    if (unsupported.length === 0) {
      unsupported.push("unclassified text");
    }

    for (const label of unsupported) {
      unsupportedCounts[label] = (unsupportedCounts[label] ?? 0) + 1;
    }

    unsupportedCards.push({
      cardId: card.id,
      cardName: card.name,
      typeLine: card.typeLine,
      unsupported,
      text,
    });
  }

  return {
    totalCards: bundle.cards.length,
    cardsWithText: bundle.cards.filter((card) => normalizeText(card).length > 0 && !card.isLand).length,
    unsupportedCards,
    unsupportedCounts,
  };
}
