import type { GameEvent, GameEventType, GameState, PlayerId } from "./types.js";

export interface EmitGameEventInput {
  type: GameEventType;
  playerId?: PlayerId;
  sourceId?: string;
  targetId?: string;
  amount?: number;
  details?: GameEvent["details"];
}

export function emitGameEvent(game: GameState, event: EmitGameEventInput): GameEvent {
  const entry: GameEvent = {
    sequence: game.events.length + 1,
    turn: game.turnNumber,
    phase: game.phase,
    type: event.type,
    playerId: event.playerId,
    sourceId: event.sourceId,
    targetId: event.targetId,
    amount: event.amount,
    details: event.details,
  };

  game.events.push(entry);
  return entry;
}
