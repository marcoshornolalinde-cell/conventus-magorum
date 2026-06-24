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

export function runSelfplay(content: ContentBundle, options: SelfplayOptions = {}): SelfplayResult {
  const maxTurns = options.maxTurns ?? 30;
  const game = createInitialGame(content, options);
  const turns: TurnSummary[] = [];

  while (game.status !== "gameOver" && game.turnNumber < maxTurns) {
    turns.push(playOneGeneralTurn(game, chooseFirstPlayableCreature, chooseBasicCombatPlan));
  }

  return {
    game,
    turns,
    reachedTurnLimit: game.status !== "gameOver" && game.turnNumber >= maxTurns,
  };
}
