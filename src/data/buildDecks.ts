import type {
  Archetype,
  ArchetypeId,
  Card,
  CardInstance,
  ContentBundle,
  PlayerDecks,
  PlayerId,
} from "../core/types.js";
import { shuffleWithSeed } from "../core/random.js";

function getArchetype(content: ContentBundle, archetypeId: ArchetypeId): Archetype {
  const archetype = content.archetypes.find((candidate) => candidate.id === archetypeId);

  if (!archetype) {
    throw new Error(`Unknown archetype ${archetypeId}.`);
  }

  return archetype;
}

function indexCards(content: ContentBundle): Map<string, Card> {
  return new Map(content.cards.map((card) => [card.id, card]));
}

export function expandArchetypePool(
  content: ContentBundle,
  playerId: PlayerId,
  archetypeIds: [ArchetypeId, ArchetypeId],
): CardInstance[] {
  const [firstArchetypeId, secondArchetypeId] = archetypeIds;

  if (content.matchSetupRules.samePlayerArchetypesMustBeDifferent && firstArchetypeId === secondArchetypeId) {
    throw new Error(`Player ${playerId} must use two different archetypes.`);
  }

  const cardsById = indexCards(content);
  const pool: CardInstance[] = [];

  for (const archetypeId of archetypeIds) {
    const archetype = getArchetype(content, archetypeId);

    for (const archetypeCard of archetype.cards) {
      const card = cardsById.get(archetypeCard.cardId);

      if (!card) {
        throw new Error(`Archetype ${archetype.id} references unknown card ${archetypeCard.cardId}.`);
      }

      for (let copyIndex = 0; copyIndex < archetypeCard.quantity; copyIndex += 1) {
        pool.push({
          instanceId: `${playerId}:${archetype.id}:${archetypeCard.cardId}:${copyIndex + 1}`,
          ownerId: playerId,
          sourceArchetypeId: archetype.id,
          card,
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
          enteredTurn: null,
          activatedAbilityIdsUsed: [],
        });
      }
    }
  }

  if (pool.length !== content.matchSetupRules.totalCardsPerPlayerPool) {
    throw new Error(`Player ${playerId} pool must have ${content.matchSetupRules.totalCardsPerPlayerPool} cards, got ${pool.length}.`);
  }

  return pool;
}

export function createPlayerDecks(
  content: ContentBundle,
  playerId: PlayerId,
  archetypeIds: [ArchetypeId, ArchetypeId],
  seed: string,
): PlayerDecks {
  const pool = expandArchetypePool(content, playerId, archetypeIds);
  const spells = pool.filter((instance) => !instance.card.isLand);
  const lands = pool.filter((instance) => instance.card.isLand);

  return {
    playerId,
    archetypeIds,
    pool,
    spellDeck: content.matchSetupRules.shuffleSpellDeck ? shuffleWithSeed(spells, `${seed}:${playerId}:spellDeck`) : spells,
    landDeck: content.matchSetupRules.shuffleLandDeck ? shuffleWithSeed(lands, `${seed}:${playerId}:landDeck`) : lands,
  };
}
