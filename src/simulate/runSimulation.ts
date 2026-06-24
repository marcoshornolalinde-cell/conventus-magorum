import { performance } from "node:perf_hooks";

import type { ArchetypeId, ContentBundle } from "../core/types.js";
import { createSeededRandom } from "../core/random.js";
import { runSelfplay, SelfplayRuntimeError, type SelfplayDiagnostic } from "../selfplay/runMatch.js";
import type { InitialPlayerConfig } from "../core/gameState.js";

export interface ArchetypeSimulationStats {
  archetype: ArchetypeId;
  played: number;
  wins: number;
  winrate: number;
}

export interface SimulationOptions {
  games?: number;
  seed?: string;
  maxTurns?: number;
}

export interface SimulationResult {
  games: number;
  completedGames: number;
  gameOvers: number;
  elapsedMs: number;
  avgMsPerGame: number;
  avgTurns: number;
  stats: ArchetypeSimulationStats[];
  errors: SelfplayDiagnostic[];
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

export function runSimulation(content: ContentBundle, options: SimulationOptions = {}): SimulationResult {
  const games = options.games ?? 1000;
  const seed = options.seed ?? "simulation-seed";
  const maxTurns = options.maxTurns ?? 40;
  const random = createSeededRandom(seed);
  const archetypes = content.archetypes.map((archetype) => archetype.id);
  const stats = new Map<ArchetypeId, { played: number; wins: number }>(
    archetypes.map((archetype) => [archetype, { played: 0, wins: 0 }]),
  );
  const errors: SelfplayDiagnostic[] = [];
  const started = performance.now();
  let completedGames = 0;
  let gameOvers = 0;
  let turns = 0;

  for (let index = 0; index < games; index += 1) {
    const players = createPlayers(archetypes, random);

    for (const player of players) {
      for (const archetypeId of player.archetypeIds) {
        stats.get(archetypeId)!.played += 1;
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

      const winner = result.game.winnerId ? result.game.players.find((player) => player.playerId === result.game.winnerId) : null;

      if (winner) {
        for (const archetypeId of winner.archetypeIds) {
          stats.get(archetypeId)!.wins += 1;
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

  return {
    games,
    completedGames,
    gameOvers,
    elapsedMs,
    avgMsPerGame: completedGames === 0 ? 0 : elapsedMs / completedGames,
    avgTurns: completedGames === 0 ? 0 : turns / completedGames,
    stats: rows,
    errors,
  };
}
