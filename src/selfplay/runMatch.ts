import { chooseBasicCombatPlan, chooseFirstPlayableCreature } from "../ai/heuristicAI.js";
import { createInitialGame, type CreateInitialGameOptions } from "../core/gameState.js";
import { playOneGeneralTurn, type TurnSummary } from "../core/turn.js";
import type { ContentBundle, GameState } from "../core/types.js";

export interface SelfplayOptions extends CreateInitialGameOptions {
  maxTurns?: number;
}

export interface SelfplayResult {
  game: GameState;
  turns: TurnSummary[];
  reachedTurnLimit: boolean;
}

export interface SelfplayDiagnostic {
  seed: string;
  players: CreateInitialGameOptions["players"];
  turnNumber: number | null;
  phase: string | null;
  status: string | null;
  message: string;
  recentLog: string[];
  recentEvents: string[];
}

export class SelfplayRuntimeError extends Error {
  readonly diagnostic: SelfplayDiagnostic;
  readonly cause: unknown;

  constructor(diagnostic: SelfplayDiagnostic, cause: unknown) {
    super(`Selfplay failed for seed ${diagnostic.seed}: ${diagnostic.message}`);
    this.name = "SelfplayRuntimeError";
    this.diagnostic = diagnostic;
    this.cause = cause;
  }
}

function createDiagnostic(
  seed: string,
  players: CreateInitialGameOptions["players"],
  game: GameState | null,
  cause: unknown,
): SelfplayDiagnostic {
  const message = cause instanceof Error ? cause.message : String(cause);

  return {
    seed,
    players,
    turnNumber: game?.turnNumber ?? null,
    phase: game?.phase ?? null,
    status: game?.status ?? null,
    message,
    recentLog: game?.log.slice(-20).map((entry) => `[T${entry.turn} ${entry.phase}] ${entry.message}`) ?? [],
    recentEvents:
      game?.events
        .slice(-20)
        .map((event) => `#${event.sequence} T${event.turn} ${event.phase} ${event.type}`) ?? [],
  };
}

export function runSelfplay(content: ContentBundle, options: SelfplayOptions = {}): SelfplayResult {
  const maxTurns = options.maxTurns ?? 30;
  const seed = options.seed ?? "default-seed";
  let game: GameState | null = null;
  const turns: TurnSummary[] = [];

  try {
    game = createInitialGame(content, options);

    while (game.status !== "gameOver" && game.turnNumber < maxTurns) {
      turns.push(playOneGeneralTurn(game, chooseFirstPlayableCreature, chooseBasicCombatPlan));
    }

    return {
      game,
      turns,
      reachedTurnLimit: game.status !== "gameOver" && game.turnNumber >= maxTurns,
    };
  } catch (error) {
    throw new SelfplayRuntimeError(createDiagnostic(seed, options.players, game, error), error);
  }
}
