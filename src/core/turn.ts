import type { CardInstance, GamePhase, GameState, PlayerId, PlayerState } from "./types.js";
import type { LegalAction } from "./types.js";
import { getLegalActions, getOpponent, getPriorityOrder, performAction, resolveTopOfStack } from "./actions.js";
import {
  clearCombatDamage,
  createSafeCombatPlan,
  resolveCombatPhase,
  type ChooseCombatAction,
  type ChooseCombatPlan,
} from "./combat.js";
import { dispatchGameEvent } from "./triggerEngine.js";
import { createEmptyManaPool } from "./mana.js";
import { assertGameStateIsValid } from "./validateGameState.js";

export interface TurnSummary {
  turnNumber: number;
  phase: GamePhase;
  gameOver: boolean;
  winnerId: PlayerId | null;
}

export type ChooseAction = (game: GameState, playerId: PlayerId, legalActions: LegalAction[]) => LegalAction;

function log(game: GameState, phase: GamePhase, message: string): void {
  game.log.push({
    turn: game.turnNumber,
    phase,
    message,
  });
}

function isGameOver(game: GameState): boolean {
  return game.status === "gameOver";
}

function drawFromSpellDeck(player: PlayerState): CardInstance | null {
  const [drawnCard, ...remainingDeck] = player.spellDeck;

  if (!drawnCard) {
    return null;
  }

  player.spellDeck = remainingDeck;
  player.hand.push(drawnCard);
  player.cardsDrawnThisTurn += 1;
  return drawnCard;
}

function putTopLandOntoBattlefield(player: PlayerState, turnNumber: number): CardInstance | null {
  const [land, ...remainingDeck] = player.landDeck;

  if (!land) {
    return null;
  }

  player.landDeck = remainingDeck;
  land.enteredTurn = turnNumber;
  land.tapped = false;
  land.damageMarked = 0;
  land.deathtouchDamageMarked = 0;
  land.powerModifier = 0;
  land.toughnessModifier = 0;
  land.staticPowerModifier = 0;
  land.staticToughnessModifier = 0;
  land.basePowerOverride = null;
  land.baseToughnessOverride = null;
  land.plusOneCounters = 0;
  land.staticKeywords = [];
  land.temporaryKeywords = [];
  land.additionalSubtypes = [];
  land.losesAbilities = false;
  land.cannotAttack = false;
  land.cannotDefend = false;
  land.temporaryCannotDefend = false;
  land.attachedToId = null;
  land.doesNotUntap = false;
  land.activatedAbilityIdsUsed = [];
  player.battlefield.push(land);
  return land;
}

function alternateAttackingPriority(game: GameState): void {
  if (game.turnNumber === 1) {
    return;
  }

  game.attackingPriorityPlayerId = getOpponent(game, game.attackingPriorityPlayerId).playerId;
  game.activePlayerId = game.attackingPriorityPlayerId;
}

function setGameOverFromDrawLoss(game: GameState, playersUnableToDraw: PlayerState[]): void {
  if (playersUnableToDraw.length === 0) {
    return;
  }

  const attackingPriorityPlayer = game.attackingPriorityPlayerId;
  const loserIds =
    playersUnableToDraw.length === game.players.length
      ? [attackingPriorityPlayer]
      : playersUnableToDraw.map((player) => player.playerId);
  const winner = game.players.find((player) => !loserIds.includes(player.playerId));

  game.status = "gameOver";
  game.phase = "gameOver";
  game.loserIds = loserIds;
  game.winnerId = winner?.playerId ?? null;

  dispatchGameEvent(game, {
    type: "gameEnded",
    playerId: game.winnerId ?? undefined,
    details: { reason: "drawLoss" },
  });
  log(game, "gameOver", `Game over. Winner: ${game.winnerId ?? "none"}.`);
}

export function beginGeneralTurn(game: GameState): void {
  if (game.status === "gameOver") {
    return;
  }

  game.turnNumber += 1;
  alternateAttackingPriority(game);
  game.phase = "start";
  game.activePlayerId = game.attackingPriorityPlayerId;

  for (const player of game.players) {
    player.cardsDrawnThisTurn = 0;
    player.manaPool = createEmptyManaPool();
    player.dragonHasteMana = 0;
  }

  log(game, "start", `General turn ${game.turnNumber} starts. Attacking priority: ${game.attackingPriorityPlayerId}.`);
  dispatchGameEvent(game, {
    type: "turnStarted",
    playerId: game.attackingPriorityPlayerId,
    details: { turnNumber: game.turnNumber },
  });

  for (const player of game.players) {
    const land = putTopLandOntoBattlefield(player, game.turnNumber);
    if (land) {
      dispatchGameEvent(game, {
        type: "landEntered",
        playerId: player.playerId,
        sourceId: land.instanceId,
        details: { cardId: land.card.id },
      });
    }
    log(game, "start", land ? `${player.playerId} puts ${land.card.name} onto the battlefield.` : `${player.playerId} has no land to put onto the battlefield.`);
  }

  const playersUnableToDraw: PlayerState[] = [];

  for (const player of game.players) {
    const drawnCard = drawFromSpellDeck(player);

    if (!drawnCard) {
      playersUnableToDraw.push(player);
      log(game, "start", `${player.playerId} cannot draw from spellDeck.`);
    } else {
      dispatchGameEvent(game, {
        type: "cardDrawn",
        playerId: player.playerId,
        sourceId: drawnCard.instanceId,
        details: { cardId: drawnCard.card.id },
      });
      log(game, "start", `${player.playerId} draws ${drawnCard.card.name}.`);
    }
  }

  setGameOverFromDrawLoss(game, playersUnableToDraw);

  if (playersUnableToDraw.length === 0) {
    game.phase = "main1";
  }

  assertGameStateIsValid(game, `after turn ${game.turnNumber} start`);
}

export function runMainPhase(game: GameState, phase: "main1" | "main2", chooseAction: ChooseAction): void {
  if (game.status === "gameOver") {
    return;
  }

  game.phase = phase;
  log(game, phase, `${phase} begins.`);

  const priorityOrder = getPriorityOrder(game);
  const passedPlayers = new Set<PlayerId>();
  let actionCount = 0;

  while (passedPlayers.size < game.players.length && !isGameOver(game)) {
    const playerId = priorityOrder[actionCount % priorityOrder.length];
    const legalActions = getLegalActions(game, playerId);
    if (legalActions.length === 0) {
      break;
    }
    const action = chooseAction(game, playerId, legalActions);

    performAction(game, action);

    if (action.type === "pass") {
      passedPlayers.add(playerId);
    } else {
      passedPlayers.clear();
      resolveStackWithResponses(game, priorityOrder, chooseAction);
    }

    actionCount += 1;

    if (actionCount > 200) {
      throw new Error(`Main phase ${phase} exceeded action guard.`);
    }
  }

  assertGameStateIsValid(game, `after ${phase}`);
}

function resolveStackWithResponses(game: GameState, priorityOrder: [PlayerId, PlayerId], chooseAction: ChooseAction): void {
  let guard = 0;

  while (game.stack.length > 0 && !isGameOver(game)) {
    const passedPlayers = new Set<PlayerId>();
    let priorityIndex = 0;

    while (passedPlayers.size < game.players.length && !isGameOver(game)) {
      const playerId = priorityOrder[priorityIndex % priorityOrder.length];
      const legalActions = getLegalActions(game, playerId);
      const action = chooseAction(game, playerId, legalActions);

      performAction(game, action);

      if (action.type === "pass") {
        passedPlayers.add(playerId);
      } else {
        passedPlayers.clear();
      }

      priorityIndex += 1;
      guard += 1;

      if (guard > 200) {
        throw new Error("Stack response window exceeded action guard.");
      }
    }

    resolveTopOfStack(game);
  }
}

export function runCombat(
  game: GameState,
  chooseCombatPlan: ChooseCombatPlan = createSafeCombatPlan,
  chooseCombatAction?: ChooseCombatAction,
): void {
  if (game.status === "gameOver") {
    return;
  }

  resolveCombatPhase(game, chooseCombatPlan, chooseCombatAction);
  assertGameStateIsValid(game, `after combat turn ${game.turnNumber}`);
}

export function cleanupGeneralTurn(game: GameState): void {
  if (game.status === "gameOver") {
    return;
  }

  game.phase = "final";
  game.exileOnDeathUntilEndOfTurn = [];
  dispatchGameEvent(game, {
    type: "endStepStarted",
    playerId: game.attackingPriorityPlayerId,
  });

  for (const player of game.players) {
    player.manaPool = createEmptyManaPool();
    player.dragonHasteMana = 0;
    for (const permanent of player.battlefield) {
      permanent.returnTappedWithCounterOnDeathUntilEndOfTurn = false;
      if (!permanent.doesNotUntap) {
        permanent.tapped = false;
      }
    }
  }

  clearCombatDamage(game);
  log(game, "final", "Final cleanup clears mana pools.");
  assertGameStateIsValid(game, `after final cleanup turn ${game.turnNumber}`);
}

export function playOneGeneralTurn(
  game: GameState,
  chooseAction: ChooseAction,
  chooseCombatPlan: ChooseCombatPlan = createSafeCombatPlan,
): TurnSummary {
  beginGeneralTurn(game);

  if (game.status !== "gameOver") {
    runMainPhase(game, "main1", chooseAction);
    runCombat(game, chooseCombatPlan, chooseAction);
    runMainPhase(game, "main2", chooseAction);
    cleanupGeneralTurn(game);
  }

  return {
    turnNumber: game.turnNumber,
    phase: game.phase,
    gameOver: game.status === "gameOver",
    winnerId: game.winnerId,
  };
}
