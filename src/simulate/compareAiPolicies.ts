import { performance } from "node:perf_hooks";

import { chooseActionWithPolicy } from "../ai/heuristicAI.js";
import type { ResolvedAiPolicyModel } from "../ai/model.js";
import { chooseCombatPlanWithPolicy, type AiPolicyWeights } from "../ai/policy.js";
import { createInitialGame, type InitialPlayerConfig } from "../core/gameState.js";
import { createSeededRandom } from "../core/random.js";
import { playOneGeneralTurn } from "../core/turn.js";
import type { ArchetypeId, CombatPlan, ContentBundle, GameState, LegalAction, PlayerId } from "../core/types.js";

export interface AiPolicyComparisonOptions {
  games?: number;
  seed?: string;
  maxTurns?: number;
  modelA: ResolvedAiPolicyModel;
  modelB: ResolvedAiPolicyModel;
}

export interface AiPolicyComparisonStats {
  label: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  winrate: number;
}

export interface AiPolicySeatStats {
  label: string;
  playerId: PlayerId;
  played: number;
  wins: number;
  winrate: number;
}

export interface AiPolicyArchetypeStats {
  label: string;
  archetype: ArchetypeId;
  played: number;
  wins: number;
  winrate: number;
}

export interface AiPolicyComparisonError {
  seed: string;
  message: string;
  turnNumber: number | null;
  phase: string | null;
  recentLog: string[];
}

export interface AiPolicyComparisonResult {
  games: number;
  completedGames: number;
  gameOvers: number;
  elapsedMs: number;
  avgMsPerGame: number;
  avgTurns: number;
  modelA: string;
  modelB: string;
  stats: AiPolicyComparisonStats[];
  seatStats: AiPolicySeatStats[];
  archetypeStats: AiPolicyArchetypeStats[];
  errors: AiPolicyComparisonError[];
}

interface MutableModelStats {
  played: number;
  wins: number;
  losses: number;
  draws: number;
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

function getWeightForPlayer(playerId: PlayerId, playerModels: Map<PlayerId, ResolvedAiPolicyModel>): AiPolicyWeights {
  const model = playerModels.get(playerId);

  if (!model) {
    throw new Error(`No model assigned to ${playerId}.`);
  }

  return model.weights;
}

function incrementModelStats(stats: Map<string, MutableModelStats>, label: string, result: "win" | "loss" | "draw"): void {
  const current = stats.get(label) ?? { played: 0, wins: 0, losses: 0, draws: 0 };
  current.played += 1;
  if (result === "win") current.wins += 1;
  if (result === "loss") current.losses += 1;
  if (result === "draw") current.draws += 1;
  stats.set(label, current);
}

function incrementWinMap(map: Map<string, { played: number; wins: number }>, key: string, won: boolean): void {
  const current = map.get(key) ?? { played: 0, wins: 0 };
  current.played += 1;
  if (won) current.wins += 1;
  map.set(key, current);
}

function createComparisonError(seed: string, game: GameState | null, error: unknown): AiPolicyComparisonError {
  return {
    seed,
    message: error instanceof Error ? error.message : String(error),
    turnNumber: game?.turnNumber ?? null,
    phase: game?.phase ?? null,
    recentLog: game?.log.slice(-20).map((entry) => `[T${entry.turn} ${entry.phase}] ${entry.message}`) ?? [],
  };
}

function toStats(label: string, value: MutableModelStats): AiPolicyComparisonStats {
  return {
    label,
    played: value.played,
    wins: value.wins,
    losses: value.losses,
    draws: value.draws,
    winrate: value.played === 0 ? 0 : value.wins / value.played,
  };
}

function toSeatStats(key: string, value: { played: number; wins: number }): AiPolicySeatStats {
  const [label, playerId] = key.split("::");
  return {
    label,
    playerId,
    played: value.played,
    wins: value.wins,
    winrate: value.played === 0 ? 0 : value.wins / value.played,
  };
}

function toArchetypeStats(key: string, value: { played: number; wins: number }): AiPolicyArchetypeStats {
  const [label, archetype] = key.split("::");
  return {
    label,
    archetype,
    played: value.played,
    wins: value.wins,
    winrate: value.played === 0 ? 0 : value.wins / value.played,
  };
}

export function compareAiPolicies(content: ContentBundle, options: AiPolicyComparisonOptions): AiPolicyComparisonResult {
  const games = options.games ?? 1000;
  const seed = options.seed ?? "ai-head-to-head";
  const maxTurns = options.maxTurns ?? 40;
  const random = createSeededRandom(seed);
  const archetypes = content.archetypes.map((archetype) => archetype.id);
  const modelStats = new Map<string, MutableModelStats>();
  const seatStats = new Map<string, { played: number; wins: number }>();
  const archetypeStats = new Map<string, { played: number; wins: number }>();
  const errors: AiPolicyComparisonError[] = [];
  const started = performance.now();
  let completedGames = 0;
  let gameOvers = 0;
  let totalTurns = 0;

  for (let index = 0; index < games; index += 1) {
    const gameSeed = `${seed}:${index}`;
    const players = createPlayers(archetypes, random);
    const modelAPlayerId: PlayerId = index % 2 === 0 ? "player1" : "player2";
    const modelBPlayerId: PlayerId = modelAPlayerId === "player1" ? "player2" : "player1";
    const playerModels = new Map<PlayerId, ResolvedAiPolicyModel>([
      [modelAPlayerId, options.modelA],
      [modelBPlayerId, options.modelB],
    ]);
    let game: GameState | null = null;

    try {
      game = createInitialGame(content, { seed: gameSeed, players });
      const chooseAction = (currentGame: GameState, playerId: PlayerId, legalActions: LegalAction[]): LegalAction =>
        chooseActionWithPolicy(currentGame, playerId, legalActions, getWeightForPlayer(playerId, playerModels));
      const chooseCombatPlan = (currentGame: GameState, playerId: PlayerId): CombatPlan =>
        chooseCombatPlanWithPolicy(currentGame, playerId, getWeightForPlayer(playerId, playerModels));

      while (game.status !== "gameOver" && game.turnNumber < maxTurns) {
        playOneGeneralTurn(game, chooseAction, chooseCombatPlan);
      }

      completedGames += 1;
      totalTurns += game.turnNumber;
      if (game.status === "gameOver") {
        gameOvers += 1;
      }

      const winnerModel = game.winnerId ? playerModels.get(game.winnerId) : null;

      for (const player of game.players) {
        const model = playerModels.get(player.playerId)!;
        const won = winnerModel?.label === model.label && game.winnerId === player.playerId;
        const result = !winnerModel ? "draw" : won ? "win" : "loss";

        incrementModelStats(modelStats, model.label, result);
        incrementWinMap(seatStats, `${model.label}::${player.playerId}`, won);

        for (const archetypeId of player.archetypeIds) {
          incrementWinMap(archetypeStats, `${model.label}::${archetypeId}`, won);
        }
      }
    } catch (error) {
      errors.push(createComparisonError(gameSeed, game, error));
    }
  }

  const elapsedMs = performance.now() - started;

  return {
    games,
    completedGames,
    gameOvers,
    elapsedMs,
    avgMsPerGame: completedGames === 0 ? 0 : elapsedMs / completedGames,
    avgTurns: completedGames === 0 ? 0 : totalTurns / completedGames,
    modelA: options.modelA.label,
    modelB: options.modelB.label,
    stats: [...modelStats.entries()].map(([label, value]) => toStats(label, value)),
    seatStats: [...seatStats.entries()].map(([key, value]) => toSeatStats(key, value)),
    archetypeStats: [...archetypeStats.entries()]
      .map(([key, value]) => toArchetypeStats(key, value))
      .sort((first, second) => first.label.localeCompare(second.label) || second.winrate - first.winrate),
    errors,
  };
}
