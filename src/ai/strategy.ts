import { getCreatureStats, getCreaturesOnBattlefield, hasKeyword } from "../core/combat.js";
import { getSpellProfile } from "../core/spells.js";
import type { Card, CardInstance, GameState, PlayerId, PlayerState } from "../core/types.js";

export type AiDeckStrategyKind = "aggro" | "control" | "tempo" | "balanced";
export type AiStrategicPosture = "press" | "race" | "stabilize" | "develop" | "resource";

export interface AiDeckStrategyMetrics {
  cardCount: number;
  nonLandCount: number;
  creatureCount: number;
  cheapCreatureCount: number;
  bigThreatCount: number;
  removalCount: number;
  cardAdvantageCount: number;
  combatTrickCount: number;
  manaDevelopmentCount: number;
  evasionCount: number;
  averageManaValue: number;
  aggroScore: number;
  controlScore: number;
  tempoScore: number;
}

export interface AiStrategyProfile {
  deckKind: AiDeckStrategyKind;
  posture: AiStrategicPosture;
  strategicConfidence: number;
  strategyEnabled: boolean;
  metrics: AiDeckStrategyMetrics;
  boardPowerDelta: number;
  boardToughnessDelta: number;
  lifeDelta: number;
  raceScore: number;
  resourceNeed: number;
  boardControlled: boolean;
}

const REMOVAL_EFFECTS = new Set([
  "destroyCreature",
  "destroyPermanent",
  "exileCreature",
  "prayerBinding",
  "damageCreature",
  "ownCreatureDealsPowerDamage",
  "returnPermanentToHand",
  "counterSpell",
]);

const CARD_ADVANTAGE_EFFECTS = new Set([
  "drawCards",
  "drawCardsIfAdditionalManaPaid",
  "optionalDiscardThenDraw",
  "returnGraveyardCreatureToHand",
  "destroyCreatureOrReturnZombieFromGraveyardToBattlefieldTapped",
  "createToken",
]);

function isCreatureCard(card: Card): boolean {
  return card.cardTypes.includes("Creature");
}

function isEvasiveCard(card: Card): boolean {
  return card.keywords.some((keyword) => ["Flying", "Menace", "Unblockable"].includes(keyword));
}

function hasSubtype(card: Card, subtype: string): boolean {
  return new RegExp(`\\b${subtype}\\b`, "i").test(card.typeLine);
}

function getCardPower(card: Card): number {
  return Number.parseInt(card.power ?? "0", 10) || 0;
}

function hasAnyEffect(card: Card, effectTypes: Set<string>): boolean {
  const profile = getSpellProfile(card);
  return profile?.effects.some((effect) => effectTypes.has(effect.type)) ?? false;
}

function isCombatTrick(card: Card): boolean {
  if (!card.cardTypes.includes("Instant")) {
    return false;
  }

  const profile = getSpellProfile(card);

  return profile?.effects.some((effect) => {
    if (effect.type === "modifyCreature" && (effect.power > 0 || effect.toughness > 0)) return true;
    if (effect.type === "modifyOwnCreatures") return true;
    if (effect.type === "grantKeywords" || effect.type === "grantKeywordsToOwnCreatures") return true;
    if (effect.type === "grantReturnTappedWithCounterOnDeath") return true;
    return false;
  }) ?? false;
}

function isManaDevelopment(card: Card): boolean {
  return card.id === "new_horizons" || card.id === "llanowar_elves" || card.id === "druid_of_the_cowl" || card.id === "elvish_archdruid" || card.id === "carnelian_orb_of_dragonkind";
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function classifyDeckStrategy(metrics: AiDeckStrategyMetrics): { deckKind: AiDeckStrategyKind; confidence: number } {
  const scores: [AiDeckStrategyKind, number][] = [
    ["aggro", metrics.aggroScore],
    ["control", metrics.controlScore],
    ["tempo", metrics.tempoScore],
  ];
  const [best, score] = scores.sort((first, second) => second[1] - first[1])[0];
  const secondBestScore = scores[1][1];
  const confidence = clamp01((score - secondBestScore) / 12) * clamp01(score / 18);

  if (score < 10 || score - secondBestScore < 1.5) {
    return { deckKind: "balanced", confidence: 0 };
  }

  return { deckKind: best, confidence };
}

export function analyzeDeckStrategy(player: PlayerState): { deckKind: AiDeckStrategyKind; confidence: number; strategyEnabled: boolean; metrics: AiDeckStrategyMetrics } {
  const cards = player.pool.map((instance) => instance.card);
  const nonLands = cards.filter((card) => !card.isLand);
  const creatures = nonLands.filter(isCreatureCard);
  const cheapCreatures = creatures.filter((card) => card.manaValue <= 2 && !hasSubtype(card, "Wall"));
  const bigThreats = creatures.filter((card) => card.manaValue >= 5 || getCardPower(card) >= 5);
  const removal = nonLands.filter((card) => hasAnyEffect(card, REMOVAL_EFFECTS));
  const cardAdvantage = nonLands.filter((card) => hasAnyEffect(card, CARD_ADVANTAGE_EFFECTS));
  const combatTricks = nonLands.filter(isCombatTrick);
  const manaDevelopment = nonLands.filter(isManaDevelopment);
  const evasion = creatures.filter(isEvasiveCard);
  const averageManaValue = nonLands.length === 0
    ? 0
    : nonLands.reduce((total, card) => total + card.manaValue, 0) / nonLands.length;
  const nonLandCount = Math.max(1, nonLands.length);
  const creatureRatio = creatures.length / nonLandCount;
  const cheapCreatureRatio = cheapCreatures.length / nonLandCount;
  const interactionRatio = removal.length / nonLandCount;
  const cardAdvantageRatio = cardAdvantage.length / nonLandCount;
  const manaDevelopmentRatio = manaDevelopment.length / nonLandCount;
  const bigThreatRatio = bigThreats.length / nonLandCount;
  const evasionRatio = evasion.length / nonLandCount;

  const metrics: AiDeckStrategyMetrics = {
    cardCount: cards.length,
    nonLandCount: nonLands.length,
    creatureCount: creatures.length,
    cheapCreatureCount: cheapCreatures.length,
    bigThreatCount: bigThreats.length,
    removalCount: removal.length,
    cardAdvantageCount: cardAdvantage.length,
    combatTrickCount: combatTricks.length,
    manaDevelopmentCount: manaDevelopment.length,
    evasionCount: evasion.length,
    averageManaValue,
    aggroScore: cheapCreatureRatio * 42 + creatureRatio * 24 + combatTricks.length * 1.6 + evasionRatio * 14 - averageManaValue * 3 - bigThreatRatio * 8,
    controlScore: interactionRatio * 48 + cardAdvantageRatio * 34 + averageManaValue * 4 - cheapCreatureRatio * 10 + Math.max(0, 0.55 - creatureRatio) * 12,
    tempoScore: manaDevelopmentRatio * 72 + bigThreatRatio * 42 + evasionRatio * 20 + interactionRatio * 14 + Math.max(0, averageManaValue - 3) * 5,
  };

  const classification = classifyDeckStrategy(metrics);

  return {
    ...classification,
    strategyEnabled: classification.deckKind !== "balanced" && classification.confidence >= 0.35,
    metrics,
  };
}

function sumBoardStats(creatures: CardInstance[]): { power: number; toughness: number; evasivePower: number } {
  return creatures.reduce(
    (total, creature) => {
      const stats = getCreatureStats(creature);
      const evasive = hasKeyword(creature, "Flying") || hasKeyword(creature, "Menace") || hasKeyword(creature, "Unblockable");

      return {
        power: total.power + Math.max(0, stats.power),
        toughness: total.toughness + Math.max(0, stats.toughness),
        evasivePower: total.evasivePower + (evasive ? Math.max(0, stats.power) : 0),
      };
    },
    { power: 0, toughness: 0, evasivePower: 0 },
  );
}

function choosePosture(
  deckKind: AiDeckStrategyKind,
  boardPowerDelta: number,
  boardToughnessDelta: number,
  lifeDelta: number,
  raceScore: number,
  resourceNeed: number,
  boardControlled: boolean,
): AiStrategicPosture {
  if (raceScore >= 8) return "race";
  if (boardPowerDelta <= -5 || (lifeDelta <= -6 && boardPowerDelta < 2) || boardToughnessDelta <= -7) return "stabilize";

  if (deckKind === "aggro") {
    return raceScore >= 0 ? "press" : "develop";
  }

  if (deckKind === "control") {
    return boardControlled && resourceNeed > 0.4 ? "resource" : "stabilize";
  }

  if (deckKind === "tempo") {
    return boardControlled || resourceNeed > 0.35 ? "develop" : "stabilize";
  }

  if (resourceNeed > 0.55 && boardControlled) return "resource";
  return boardControlled ? "develop" : "stabilize";
}

export function analyzeAiStrategy(game: GameState, playerId: PlayerId): AiStrategyProfile {
  const player = game.players.find((candidate) => candidate.playerId === playerId);
  const opponent = game.players.find((candidate) => candidate.playerId !== playerId);

  if (!player || !opponent) {
    throw new Error(`Cannot analyze AI strategy for unknown player ${playerId}.`);
  }

  const deck = analyzeDeckStrategy(player);
  const ownStats = sumBoardStats(getCreaturesOnBattlefield(player));
  const opponentStats = sumBoardStats(getCreaturesOnBattlefield(opponent));
  const boardPowerDelta = ownStats.power - opponentStats.power;
  const boardToughnessDelta = ownStats.toughness - opponentStats.toughness;
  const lifeDelta = player.lifeTotal - opponent.lifeTotal;
  const opponentClock = opponent.lifeTotal <= 0 ? 10 : ownStats.power / Math.max(1, opponent.lifeTotal);
  const ownClockRisk = player.lifeTotal <= 0 ? 10 : opponentStats.power / Math.max(1, player.lifeTotal);
  const raceScore = boardPowerDelta + lifeDelta * 0.45 + ownStats.evasivePower * 1.4 + opponentClock * 10 - ownClockRisk * 8;
  const resourceNeed = Math.max(0, Math.min(1, (4 - player.hand.length) / 4 + Math.max(0, 4 - game.turnNumber) * 0.08));
  const boardControlled = boardPowerDelta >= -2 && boardToughnessDelta >= -3 && player.lifeTotal > 8;
  const posture = choosePosture(deck.deckKind, boardPowerDelta, boardToughnessDelta, lifeDelta, raceScore, resourceNeed, boardControlled);

  return {
    deckKind: deck.deckKind,
    posture,
    strategicConfidence: deck.confidence,
    strategyEnabled: deck.strategyEnabled,
    metrics: deck.metrics,
    boardPowerDelta,
    boardToughnessDelta,
    lifeDelta,
    raceScore,
    resourceNeed,
    boardControlled,
  };
}
