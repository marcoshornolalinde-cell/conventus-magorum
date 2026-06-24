import { performance } from "node:perf_hooks";

import type { ArchetypeId, ContentBundle, GameEvent, PlayerState } from "../core/types.js";
import { createSeededRandom } from "../core/random.js";
import { runSelfplay, SelfplayRuntimeError, type SelfplayDiagnostic } from "../selfplay/runMatch.js";
import type { InitialPlayerConfig } from "../core/gameState.js";

export interface ArchetypeSimulationStats {
  archetype: ArchetypeId;
  played: number;
  wins: number;
  winrate: number;
}

export interface PairSimulationStats {
  pair: string;
  archetypes: [ArchetypeId, ArchetypeId];
  played: number;
  wins: number;
  winrate: number;
}

export interface MatchupSimulationStats {
  archetype: ArchetypeId;
  opponentArchetype: ArchetypeId;
  played: number;
  wins: number;
  winrate: number;
}

export interface CardSimulationStats {
  cardId: string;
  cardName: string;
  count: number;
  perGame: number;
}

export interface DamageSimulationStats {
  totalPlayerDamage: number;
  totalPlayerLifeLoss: number;
  avgPlayerDamagePerGame: number;
  avgPlayerLifeLossPerGame: number;
}

export interface SimulationOptions {
  games?: number;
  seed?: string;
  maxTurns?: number;
  topCards?: number;
}

export interface SimulationResult {
  games: number;
  completedGames: number;
  gameOvers: number;
  elapsedMs: number;
  avgMsPerGame: number;
  avgTurns: number;
  stats: ArchetypeSimulationStats[];
  pairStats: PairSimulationStats[];
  matchupMatrix: MatchupSimulationStats[];
  damage: DamageSimulationStats;
  mostPlayedCards: CardSimulationStats[];
  deadInHandCards: CardSimulationStats[];
  allHandEndCards: CardSimulationStats[];
  errors: SelfplayDiagnostic[];
}

interface CountedCard {
  cardId: string;
  cardName: string;
  count: number;
}

function pickDistinctArchetypes(archetypes: ArchetypeId[], random: () => number, count: number): ArchetypeId[] {
  const shuffled = [...archetypes];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled.slice(0, count);
}

function createPlayers(archetypes: ArchetypeId[], random: () => number): [InitialPlayerConfig, InitialPlayerConfig] {
  const [first, second, third, fourth] = pickDistinctArchetypes(archetypes, random, 4);

  return [
    { id: "player1", archetypeIds: [first, second] },
    { id: "player2", archetypeIds: [third, fourth] },
  ];
}

function pairKey(archetypeIds: [ArchetypeId, ArchetypeId]): string {
  return [...archetypeIds].sort().join("+");
}

function incrementCardCount(map: Map<string, CountedCard>, cardId: string, cardName: string, amount = 1): void {
  const current = map.get(cardId) ?? { cardId, cardName, count: 0 };
  current.count += amount;
  map.set(cardId, current);
}

function isPlayerDamageEvent(event: GameEvent): boolean {
  return event.type === "damageDealt" && event.details?.targetType === "player" && event.details.lossOfLife !== true;
}

function isPlayerLifeLossEvent(event: GameEvent): boolean {
  return event.type === "damageDealt" && event.details?.targetType === "player" && event.details.lossOfLife === true;
}

function collectPlayedCards(events: GameEvent[], cardsById: Map<string, string>, counts: Map<string, CountedCard>): void {
  for (const event of events) {
    if (event.type !== "spellCast" || typeof event.details?.cardId !== "string") {
      continue;
    }

    const cardId = event.details.cardId;
    incrementCardCount(counts, cardId, cardsById.get(cardId) ?? cardId);
  }
}

function collectHandCards(players: PlayerState[], counts: Map<string, CountedCard>): void {
  for (const player of players) {
    for (const card of player.hand) {
      incrementCardCount(counts, card.card.id, card.card.name);
    }
  }
}

function collectLosingHandCards(players: PlayerState[], loserIds: string[], counts: Map<string, CountedCard>): void {
  for (const player of players) {
    if (!loserIds.includes(player.playerId)) {
      continue;
    }

    collectHandCards([player], counts);
  }
}

function toCardStats(map: Map<string, CountedCard>, completedGames: number, top: number): CardSimulationStats[] {
  return [...map.values()]
    .map((entry) => ({
      cardId: entry.cardId,
      cardName: entry.cardName,
      count: entry.count,
      perGame: completedGames === 0 ? 0 : entry.count / completedGames,
    }))
    .sort((first, second) => second.count - first.count || first.cardName.localeCompare(second.cardName))
    .slice(0, top);
}

export function runSimulation(content: ContentBundle, options: SimulationOptions = {}): SimulationResult {
  const games = options.games ?? 1000;
  const seed = options.seed ?? "simulation-seed";
  const maxTurns = options.maxTurns ?? 40;
  const topCards = options.topCards ?? 20;
  const random = createSeededRandom(seed);
  const archetypes = content.archetypes.map((archetype) => archetype.id);
  const cardsById = new Map(content.cards.map((card) => [card.id, card.name]));
  const stats = new Map<ArchetypeId, { played: number; wins: number }>(
    archetypes.map((archetype) => [archetype, { played: 0, wins: 0 }]),
  );
  const pairStats = new Map<string, { archetypes: [ArchetypeId, ArchetypeId]; played: number; wins: number }>();
  const matchupStats = new Map<string, { archetype: ArchetypeId; opponentArchetype: ArchetypeId; played: number; wins: number }>();
  const playedCardCounts = new Map<string, CountedCard>();
  const deadInHandCardCounts = new Map<string, CountedCard>();
  const allHandEndCardCounts = new Map<string, CountedCard>();
  const errors: SelfplayDiagnostic[] = [];
  const started = performance.now();
  let completedGames = 0;
  let gameOvers = 0;
  let turns = 0;
  let totalPlayerDamage = 0;
  let totalPlayerLifeLoss = 0;

  for (let index = 0; index < games; index += 1) {
    const players = createPlayers(archetypes, random);
    const playerPairKeys = new Map<string, string>();

    for (const player of players) {
      const key = pairKey(player.archetypeIds);
      playerPairKeys.set(player.id, key);
      const pair = pairStats.get(key) ?? { archetypes: [...player.archetypeIds].sort() as [ArchetypeId, ArchetypeId], played: 0, wins: 0 };
      pair.played += 1;
      pairStats.set(key, pair);

      for (const archetypeId of player.archetypeIds) {
        stats.get(archetypeId)!.played += 1;
      }
    }

    for (const player of players) {
      const opponent = players.find((candidate) => candidate.id !== player.id)!;

      for (const archetypeId of player.archetypeIds) {
        for (const opponentArchetypeId of opponent.archetypeIds) {
          const key = `${archetypeId}->${opponentArchetypeId}`;
          const matchup = matchupStats.get(key) ?? {
            archetype: archetypeId,
            opponentArchetype: opponentArchetypeId,
            played: 0,
            wins: 0,
          };
          matchup.played += 1;
          matchupStats.set(key, matchup);
        }
      }
    }

    try {
      const result = runSelfplay(content, {
        seed: `${seed}:${index}`,
        maxTurns,
        players,
      });
      completedGames += 1;
      turns += result.game.turnNumber;

      if (result.game.status === "gameOver") {
        gameOvers += 1;
      }

      totalPlayerDamage += result.game.events.filter(isPlayerDamageEvent).reduce((total, event) => total + (event.amount ?? 0), 0);
      totalPlayerLifeLoss += result.game.events.filter(isPlayerLifeLossEvent).reduce((total, event) => total + (event.amount ?? 0), 0);
      collectPlayedCards(result.game.events, cardsById, playedCardCounts);
      collectHandCards(result.game.players, allHandEndCardCounts);
      collectLosingHandCards(result.game.players, result.game.loserIds, deadInHandCardCounts);

      const winner = result.game.winnerId ? result.game.players.find((player) => player.playerId === result.game.winnerId) : null;

      if (winner) {
        const winningPairKey = playerPairKeys.get(winner.playerId);

        if (winningPairKey) {
          pairStats.get(winningPairKey)!.wins += 1;
        }

        for (const archetypeId of winner.archetypeIds) {
          stats.get(archetypeId)!.wins += 1;
        }

        const loser = result.game.players.find((player) => player.playerId !== winner.playerId);

        if (loser) {
          for (const archetypeId of winner.archetypeIds) {
            for (const opponentArchetypeId of loser.archetypeIds) {
              matchupStats.get(`${archetypeId}->${opponentArchetypeId}`)!.wins += 1;
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof SelfplayRuntimeError) {
        errors.push(error.diagnostic);
        continue;
      }

      throw error;
    }
  }

  const elapsedMs = performance.now() - started;
  const rows = [...stats.entries()]
    .map(([archetype, value]) => ({
      archetype,
      played: value.played,
      wins: value.wins,
      winrate: value.played === 0 ? 0 : value.wins / value.played,
    }))
    .sort((first, second) => second.winrate - first.winrate);
  const pairRows = [...pairStats.entries()]
    .map(([key, value]) => ({
      pair: key,
      archetypes: value.archetypes,
      played: value.played,
      wins: value.wins,
      winrate: value.played === 0 ? 0 : value.wins / value.played,
    }))
    .sort((first, second) => second.winrate - first.winrate || second.played - first.played);
  const matchupRows = [...matchupStats.values()]
    .map((value) => ({
      archetype: value.archetype,
      opponentArchetype: value.opponentArchetype,
      played: value.played,
      wins: value.wins,
      winrate: value.played === 0 ? 0 : value.wins / value.played,
    }))
    .sort((first, second) => first.archetype.localeCompare(second.archetype) || first.opponentArchetype.localeCompare(second.opponentArchetype));

  return {
    games,
    completedGames,
    gameOvers,
    elapsedMs,
    avgMsPerGame: completedGames === 0 ? 0 : elapsedMs / completedGames,
    avgTurns: completedGames === 0 ? 0 : turns / completedGames,
    stats: rows,
    pairStats: pairRows,
    matchupMatrix: matchupRows,
    damage: {
      totalPlayerDamage,
      totalPlayerLifeLoss,
      avgPlayerDamagePerGame: completedGames === 0 ? 0 : totalPlayerDamage / completedGames,
      avgPlayerLifeLossPerGame: completedGames === 0 ? 0 : totalPlayerLifeLoss / completedGames,
    },
    mostPlayedCards: toCardStats(playedCardCounts, completedGames, topCards),
    deadInHandCards: toCardStats(deadInHandCardCounts, completedGames, topCards),
    allHandEndCards: toCardStats(allHandEndCardCounts, completedGames, topCards),
    errors,
  };
}
