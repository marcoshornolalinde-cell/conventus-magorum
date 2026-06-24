import type { Archetype, Card, ContentBundle, ValidationResult } from "../core/types.js";

function addError(errors: string[], message: string): void {
  errors.push(message);
}

function sumQuantities(archetype: Archetype, predicate: (card: Archetype["cards"][number]) => boolean): number {
  return archetype.cards
    .filter(predicate)
    .reduce((total, card) => total + card.quantity, 0);
}

function validateCard(card: Card, errors: string[]): void {
  if (!card.id) addError(errors, "Card is missing id.");
  if (!card.name) addError(errors, `Card ${card.id || "(unknown)"} is missing name.`);
  if (!Array.isArray(card.cardTypes)) addError(errors, `Card ${card.id} has invalid cardTypes.`);
  if (typeof card.isLand !== "boolean") addError(errors, `Card ${card.id} has invalid isLand.`);
}

function validateArchetype(
  archetype: Archetype,
  cardsById: Map<string, Card>,
  cardsPerArchetype: number,
  errors: string[],
): void {
  if (!archetype.id) addError(errors, "Archetype is missing id.");
  if (!archetype.name) addError(errors, `Archetype ${archetype.id || "(unknown)"} is missing name.`);
  if (!Array.isArray(archetype.cards)) {
    addError(errors, `Archetype ${archetype.id} has invalid cards list.`);
    return;
  }

  const totalCards = sumQuantities(archetype, () => true);
  const landCount = sumQuantities(archetype, (card) => card.isLand);
  const spellCount = sumQuantities(archetype, (card) => !card.isLand);

  if (totalCards !== archetype.cardCount) {
    addError(errors, `Archetype ${archetype.id} declares ${archetype.cardCount} cards but has ${totalCards}.`);
  }

  if (totalCards !== cardsPerArchetype) {
    addError(errors, `Archetype ${archetype.id} must have ${cardsPerArchetype} cards, got ${totalCards}.`);
  }

  if (landCount !== archetype.landCount) {
    addError(errors, `Archetype ${archetype.id} declares ${archetype.landCount} lands but has ${landCount}.`);
  }

  if (spellCount !== archetype.spellCount) {
    addError(errors, `Archetype ${archetype.id} declares ${archetype.spellCount} spells but has ${spellCount}.`);
  }

  for (const archetypeCard of archetype.cards) {
    const sourceCard = cardsById.get(archetypeCard.cardId);

    if (!sourceCard) {
      addError(errors, `Archetype ${archetype.id} references unknown card ${archetypeCard.cardId}.`);
      continue;
    }

    if (sourceCard.isLand !== archetypeCard.isLand) {
      addError(errors, `Archetype ${archetype.id} has mismatched land flag for ${archetypeCard.cardId}.`);
    }
  }
}

export function validateContentBundle(bundle: ContentBundle): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (bundle.schemaVersion !== 1) {
    addError(errors, `Unsupported content schema version ${bundle.schemaVersion}.`);
  }

  if (!Array.isArray(bundle.cards)) {
    addError(errors, "Bundle cards must be an array.");
  }

  if (!Array.isArray(bundle.archetypes)) {
    addError(errors, "Bundle archetypes must be an array.");
  }

  if (!bundle.matchSetupRules) {
    addError(errors, "Bundle is missing matchSetupRules.");
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  const cardsById = new Map<string, Card>();

  for (const card of bundle.cards) {
    validateCard(card, errors);

    if (cardsById.has(card.id)) {
      addError(errors, `Duplicate card id ${card.id}.`);
    }

    cardsById.set(card.id, card);
  }

  for (const archetype of bundle.archetypes) {
    validateArchetype(archetype, cardsById, bundle.matchSetupRules.cardsPerArchetype, errors);
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function assertContentBundleIsValid(bundle: ContentBundle): void {
  const result = validateContentBundle(bundle);

  if (!result.valid) {
    throw new Error(`Invalid content bundle:\n${result.errors.join("\n")}`);
  }
}
