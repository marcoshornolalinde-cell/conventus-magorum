import type { CardInstance, GameState, PlayerState } from "./types.js";

export interface GameStateValidationResult {
  valid: boolean;
  errors: string[];
}

function collectZoneInstances(player: PlayerState): Array<{ zone: string; instance: CardInstance }> {
  return [
    ...player.spellDeck.map((instance) => ({ zone: `${player.playerId}.spellDeck`, instance })),
    ...player.landDeck.map((instance) => ({ zone: `${player.playerId}.landDeck`, instance })),
    ...player.hand.map((instance) => ({ zone: `${player.playerId}.hand`, instance })),
    ...player.battlefield.map((instance) => ({ zone: `${player.playerId}.battlefield`, instance })),
    ...player.graveyard.map((instance) => ({ zone: `${player.playerId}.graveyard`, instance })),
    ...player.exile.map((instance) => ({ zone: `${player.playerId}.exile`, instance })),
  ];
}

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

function validatePlayerZones(game: GameState, player: PlayerState, errors: string[]): void {
  const zones = collectZoneInstances(player);
  const seen = new Map<string, string>();

  for (const { zone, instance } of zones) {
    if (instance.ownerId !== player.playerId) {
      errors.push(`${instance.instanceId} is in ${zone} but owner is ${instance.ownerId}.`);
    }

    const previousZone = seen.get(instance.instanceId);
    if (previousZone) {
      errors.push(`${instance.instanceId} appears in both ${previousZone} and ${zone}.`);
    } else {
      seen.set(instance.instanceId, zone);
    }
  }

  for (const poolInstance of player.pool) {
    const inZone = seen.has(poolInstance.instanceId);
    const inStack = game.stack.some((stackItem) => stackItem.source.instanceId === poolInstance.instanceId);

    if (!inZone && !inStack) {
      errors.push(`${poolInstance.instanceId} from ${player.playerId}.pool is missing from all zones and stack.`);
    }
  }

  const expectedOwnedCount = player.pool.length;
  const actualOwnedCount =
    zones.length + game.stack.filter((stackItem) => stackItem.source.ownerId === player.playerId).length;

  if (actualOwnedCount !== expectedOwnedCount) {
    errors.push(`${player.playerId} owns ${expectedOwnedCount} cards but ${actualOwnedCount} are in zones/stack.`);
  }
}

function validateStack(game: GameState, errors: string[]): void {
  const stackIds = new Set<string>();

  for (const stackItem of game.stack) {
    if (stackIds.has(stackItem.id)) {
      errors.push(`Duplicate stack item id ${stackItem.id}.`);
    }
    stackIds.add(stackItem.id);

    if (!game.players.some((player) => player.playerId === stackItem.controllerId)) {
      errors.push(`Stack item ${stackItem.id} has unknown controller ${stackItem.controllerId}.`);
    }

    for (const player of game.players) {
      const zone = collectZoneInstances(player).find(({ instance }) => instance.instanceId === stackItem.source.instanceId);
      if (zone) {
        errors.push(`${stackItem.source.instanceId} is on stack item ${stackItem.id} and also in ${zone.zone}.`);
      }
    }
  }
}

function validateAttachments(game: GameState, errors: string[]): void {
  const battlefieldIds = new Set(game.players.flatMap((player) => player.battlefield.map((instance) => instance.instanceId)));

  for (const player of game.players) {
    for (const permanent of player.battlefield) {
      if (permanent.attachedToId && !battlefieldIds.has(permanent.attachedToId)) {
        errors.push(`${permanent.instanceId} is attached to missing permanent ${permanent.attachedToId}.`);
      }

      if (permanent.attachedToId === permanent.instanceId) {
        errors.push(`${permanent.instanceId} is attached to itself.`);
      }
    }
  }
}

function validateNumericState(game: GameState, errors: string[]): void {
  if (!Number.isInteger(game.turnNumber) || game.turnNumber < 0) {
    errors.push(`Invalid turn number ${game.turnNumber}.`);
  }

  for (const player of game.players) {
    if (!isFiniteNumber(player.lifeTotal)) {
      errors.push(`${player.playerId} has invalid life total ${player.lifeTotal}.`);
    }

    for (const [symbol, amount] of Object.entries(player.manaPool)) {
      if (!Number.isInteger(amount) || amount < 0) {
        errors.push(`${player.playerId} has invalid ${symbol} mana amount ${amount}.`);
      }
    }

    for (const { zone, instance } of collectZoneInstances(player)) {
      if (instance.damageMarked < 0 || instance.deathtouchDamageMarked < 0) {
        errors.push(`${instance.instanceId} in ${zone} has negative marked damage.`);
      }
      if (instance.plusOneCounters < 0) {
        errors.push(`${instance.instanceId} in ${zone} has negative +1/+1 counters.`);
      }
    }
  }
}

function validateGameOverState(game: GameState, errors: string[]): void {
  if (game.status === "gameOver") {
    if (game.phase !== "gameOver") {
      errors.push(`Game is over but phase is ${game.phase}.`);
    }
    if (!game.winnerId && game.loserIds.length === 0) {
      errors.push("Game is over without winner or losers.");
    }
  }

  if (game.winnerId && !game.players.some((player) => player.playerId === game.winnerId)) {
    errors.push(`Winner ${game.winnerId} is not a player.`);
  }

  for (const loserId of game.loserIds) {
    if (!game.players.some((player) => player.playerId === loserId)) {
      errors.push(`Loser ${loserId} is not a player.`);
    }
  }
}

function validateEvents(game: GameState, errors: string[]): void {
  const playerIds = new Set(game.players.map((player) => player.playerId));

  game.events.forEach((event, index) => {
    const expectedSequence = index + 1;

    if (event.sequence !== expectedSequence) {
      errors.push(`Event at index ${index} has sequence ${event.sequence}, expected ${expectedSequence}.`);
    }

    if (!Number.isInteger(event.turn) || event.turn < 0) {
      errors.push(`Event ${event.sequence} has invalid turn ${event.turn}.`);
    }

    if (event.playerId && !playerIds.has(event.playerId)) {
      errors.push(`Event ${event.sequence} has unknown player ${event.playerId}.`);
    }

    if (event.amount !== undefined && (!Number.isFinite(event.amount) || event.amount < 0)) {
      errors.push(`Event ${event.sequence} has invalid amount ${event.amount}.`);
    }
  });
}

export function validateGameState(game: GameState): GameStateValidationResult {
  const errors: string[] = [];
  const playerIds = new Set<string>();

  if (game.players.length !== 2) {
    errors.push(`Game must have exactly 2 players, got ${game.players.length}.`);
  }

  for (const player of game.players) {
    if (playerIds.has(player.playerId)) {
      errors.push(`Duplicate player id ${player.playerId}.`);
    }
    playerIds.add(player.playerId);
    validatePlayerZones(game, player, errors);
  }

  if (!playerIds.has(game.activePlayerId)) {
    errors.push(`Active player ${game.activePlayerId} is not a player.`);
  }

  if (!playerIds.has(game.attackingPriorityPlayerId)) {
    errors.push(`Attacking priority player ${game.attackingPriorityPlayerId} is not a player.`);
  }

  validateStack(game, errors);
  validateAttachments(game, errors);
  validateNumericState(game, errors);
  validateGameOverState(game, errors);
  validateEvents(game, errors);

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function assertGameStateIsValid(game: GameState, context = "game state"): void {
  const result = validateGameState(game);

  if (!result.valid) {
    throw new Error(`Invalid ${context}:\n${result.errors.join("\n")}`);
  }
}
