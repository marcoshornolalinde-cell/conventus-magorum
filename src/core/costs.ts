import type { AdditionalCostPayment, Card, CardInstance, PlayerState } from "./types.js";
import { canPayManaCost } from "./mana.js";

function normalizeText(card: Card): string {
  return card.gameText.replace(/\s+/g, " ").trim();
}

export function getOptionalAdditionalManaCost(card: Card): string {
  const text = normalizeText(card);
  const payMatch = text.match(/As an additional cost to cast this spell, .* or pay (\{[^.]+})/i);
  return payMatch?.[1] ?? "";
}

export function requiresAdditionalDiscard(card: Card): boolean {
  return /As an additional cost to cast this spell, discard a card/i.test(normalizeText(card));
}

export function canPayFullManaPath(player: PlayerState, card: CardInstance): boolean {
  return canPayManaCost(player.manaPool, getEffectiveManaCost(player, card, [{ type: "mana", manaCost: getOptionalAdditionalManaCost(card.card) }]));
}

function hasSubtype(instance: CardInstance, subtype: string): boolean {
  return new RegExp(`\\b${subtype}\\b`, "i").test(instance.card.typeLine);
}

function isInstantOrSorcery(instance: CardInstance): boolean {
  return instance.card.cardTypes.includes("Instant") || instance.card.cardTypes.includes("Sorcery");
}

function reduceGenericManaCost(manaCost: string, reduction: number): string {
  if (reduction <= 0) {
    return manaCost;
  }

  const genericMatch = manaCost.match(/\{(\d+)}/);

  if (!genericMatch) {
    return manaCost;
  }

  const generic = Number.parseInt(genericMatch[1], 10);
  const nextGeneric = Math.max(0, generic - reduction);
  return manaCost.replace(genericMatch[0], nextGeneric > 0 ? `{${nextGeneric}}` : "");
}

function getGenericCostReduction(player: PlayerState, card: CardInstance): number {
  let reduction = 0;

  if (hasSubtype(card, "Dragon")) {
    reduction += player.battlefield.filter((permanent) => permanent.card.id === "dragonlords_servant").length;
  }

  if (card.card.id === "tolarian_terror") {
    reduction += player.graveyard.filter(isInstantOrSorcery).length;
  }

  if (card.card.id === "arcane_epiphany" && player.battlefield.some((permanent) => hasSubtype(permanent, "Wizard"))) {
    reduction += 1;
  }

  return reduction;
}

export function getAdditionalCostOptions(player: PlayerState, card: CardInstance): AdditionalCostPayment[][] {
  const options: AdditionalCostPayment[][] = [[]];
  const optionalManaCost = getOptionalAdditionalManaCost(card.card);

  if (/As an additional cost to cast this spell, sacrifice a creature or pay/i.test(normalizeText(card.card))) {
    const sacrificeOptions: AdditionalCostPayment[][] = player.battlefield
      .filter((permanent) => permanent.card.cardTypes.includes("Creature"))
      .map((creature) => [
      { type: "sacrificeCreature" as const, permanentId: creature.instanceId },
    ]);

    if (optionalManaCost && canPayFullManaPath(player, card)) {
      sacrificeOptions.push([{ type: "mana", manaCost: optionalManaCost }]);
    }

    return sacrificeOptions;
  }

  if (requiresAdditionalDiscard(card.card)) {
    return player.hand
      .filter((candidate) => candidate.instanceId !== card.instanceId)
      .map((candidate) => [{ type: "discard" as const, cardInstanceId: candidate.instanceId }]);
  }

  if (optionalManaCost) {
    return [[{ type: "mana", manaCost: optionalManaCost }]];
  }

  return options;
}

export function getManaCostForPayment(card: Card, additionalCosts: AdditionalCostPayment[]): string {
  return `${card.manaCost}${additionalCosts
    .filter((cost): cost is { type: "mana"; manaCost: string } => cost.type === "mana")
    .map((cost) => cost.manaCost)
    .join("")}`;
}

export function getEffectiveManaCost(
  player: PlayerState,
  card: CardInstance,
  additionalCosts: AdditionalCostPayment[] = [],
): string {
  const reducedBaseCost = reduceGenericManaCost(card.card.manaCost, getGenericCostReduction(player, card));
  return `${reducedBaseCost}${additionalCosts
    .filter((cost): cost is { type: "mana"; manaCost: string } => cost.type === "mana" && cost.manaCost.length > 0)
    .map((cost) => cost.manaCost)
    .join("")}`;
}

export function hasPayableAdditionalCosts(player: PlayerState, card: CardInstance): boolean {
  return getAdditionalCostOptions(player, card).some((costs) => canPayManaCost(player.manaPool, getEffectiveManaCost(player, card, costs)));
}
