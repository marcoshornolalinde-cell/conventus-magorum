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
  return canPayManaCost(player.manaPool, `${card.card.manaCost}${getOptionalAdditionalManaCost(card.card)}`);
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

export function hasPayableAdditionalCosts(player: PlayerState, card: CardInstance): boolean {
  return getAdditionalCostOptions(player, card).some((costs) => canPayManaCost(player.manaPool, getManaCostForPayment(card.card, costs)));
}
