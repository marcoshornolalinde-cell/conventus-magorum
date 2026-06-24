import { emitGameEvent, type EmitGameEventInput } from "./events.js";
import type { Card, CardInstance, GameEvent, GameState, PlayerId, PlayerState } from "./types.js";

type TriggerCondition =
  | { type: "thisEnters" }
  | { type: "anotherCreatureYouControlEnters" }
  | { type: "youGainLife" }
  | { type: "youDrawCard" }
  | { type: "youDrawSecondCard" }
  | { type: "thisDies" }
  | { type: "creatureYouControlDies" };

type TriggerEffect =
  | { type: "drawCards"; amount: number }
  | { type: "gainLife"; amount: number }
  | { type: "eachOpponentLosesLife"; amount: number }
  | { type: "addPlusOneCounters"; amount: number; target: "source" };

export interface TriggeredAbilityProfile {
  sourceText: string;
  condition: TriggerCondition;
  effects: TriggerEffect[];
}

function normalizeText(card: Card): string {
  return card.gameText.replace(/\s+/g, " ").trim();
}

export function getTriggeredAbilityProfiles(card: Card): TriggeredAbilityProfile[] {
  const profiles: TriggeredAbilityProfile[] = [];
  const text = normalizeText(card);

  if (/\bWhen this creature enters, draw a card\b/i.test(text)) {
    profiles.push({
      sourceText: "When this creature enters, draw a card.",
      condition: { type: "thisEnters" },
      effects: [{ type: "drawCards", amount: 1 }],
    });
  }

  const entersGainAndDraw = text.match(/\bWhen this creature enters, you gain (\d+) life and draw a card\b/i);
  if (entersGainAndDraw) {
    profiles.push({
      sourceText: entersGainAndDraw[0],
      condition: { type: "thisEnters" },
      effects: [
        { type: "gainLife", amount: Number.parseInt(entersGainAndDraw[1], 10) },
        { type: "drawCards", amount: 1 },
      ],
    });
  }

  const entersDrain = text.match(/\bWhen this creature enters, each opponent loses (\d+) life and you gain (\d+) life\b/i);
  if (entersDrain) {
    profiles.push({
      sourceText: entersDrain[0],
      condition: { type: "thisEnters" },
      effects: [
        { type: "eachOpponentLosesLife", amount: Number.parseInt(entersDrain[1], 10) },
        { type: "gainLife", amount: Number.parseInt(entersDrain[2], 10) },
      ],
    });
  }

  const anotherCreatureEntersGain = text.match(/\bWhenever another creature you control enters, you gain (\d+) life\b/i);
  if (anotherCreatureEntersGain) {
    profiles.push({
      sourceText: anotherCreatureEntersGain[0],
      condition: { type: "anotherCreatureYouControlEnters" },
      effects: [{ type: "gainLife", amount: Number.parseInt(anotherCreatureEntersGain[1], 10) }],
    });
  }

  if (/\bWhenever you gain life, put a \+1\/\+1 counter on this creature\b/i.test(text)) {
    profiles.push({
      sourceText: "Whenever you gain life, put a +1/+1 counter on this creature.",
      condition: { type: "youGainLife" },
      effects: [{ type: "addPlusOneCounters", amount: 1, target: "source" }],
    });
  }

  if (/\bWhenever you draw a card, put a \+1\/\+1 counter on this creature\b/i.test(text)) {
    profiles.push({
      sourceText: "Whenever you draw a card, put a +1/+1 counter on this creature.",
      condition: { type: "youDrawCard" },
      effects: [{ type: "addPlusOneCounters", amount: 1, target: "source" }],
    });
  }

  if (/\bWhenever you draw your second card each turn, put a \+1\/\+1 counter on this creature\b/i.test(text)) {
    profiles.push({
      sourceText: "Whenever you draw your second card each turn, put a +1/+1 counter on this creature.",
      condition: { type: "youDrawSecondCard" },
      effects: [{ type: "addPlusOneCounters", amount: 1, target: "source" }],
    });
  }

  const creatureDiesDrain = text.match(
    /\bWhenever this creature or another creature you control dies, target opponent loses (\d+) life and you gain (\d+) life\b/i,
  );
  if (creatureDiesDrain) {
    profiles.push({
      sourceText: creatureDiesDrain[0],
      condition: { type: "creatureYouControlDies" },
      effects: [
        { type: "eachOpponentLosesLife", amount: Number.parseInt(creatureDiesDrain[1], 10) },
        { type: "gainLife", amount: Number.parseInt(creatureDiesDrain[2], 10) },
      ],
    });
  }

  return profiles;
}

function getPlayer(game: GameState, playerId: PlayerId): PlayerState {
  const player = game.players.find((candidate) => candidate.playerId === playerId);

  if (!player) {
    throw new Error(`Unknown player ${playerId}.`);
  }

  return player;
}

function getOpponent(game: GameState, playerId: PlayerId): PlayerState {
  const opponent = game.players.find((candidate) => candidate.playerId !== playerId);

  if (!opponent) {
    throw new Error(`Player ${playerId} has no opponent.`);
  }

  return opponent;
}

function findInstance(game: GameState, instanceId: string): CardInstance | null {
  for (const player of game.players) {
    const instance = [...player.battlefield, ...player.graveyard, ...player.exile].find(
      (candidate) => candidate.instanceId === instanceId,
    );

    if (instance) {
      return instance;
    }
  }

  return null;
}

function getBattlefieldController(game: GameState, instanceId: string): PlayerState | null {
  return game.players.find((player) => player.battlefield.some((instance) => instance.instanceId === instanceId)) ?? null;
}

function battlefieldTriggerSources(game: GameState): Array<{ controller: PlayerState; source: CardInstance }> {
  return game.players.flatMap((controller) =>
    controller.battlefield.map((source) => ({
      controller,
      source,
    })),
  );
}

function deathTriggerSources(game: GameState, event: GameEvent): Array<{ controller: PlayerState; source: CardInstance }> {
  const diedPermanent = event.sourceId ? findInstance(game, event.sourceId) : null;
  const battlefieldSources = battlefieldTriggerSources(game);

  if (!diedPermanent) {
    return battlefieldSources;
  }

  return [
    ...battlefieldSources,
    {
      controller: getPlayer(game, diedPermanent.ownerId),
      source: diedPermanent,
    },
  ];
}

function conditionMatches(
  game: GameState,
  event: GameEvent,
  controller: PlayerState,
  source: CardInstance,
  condition: TriggerCondition,
): boolean {
  if (condition.type === "thisEnters") {
    return event.type === "creatureEntered" && event.sourceId === source.instanceId;
  }

  if (condition.type === "anotherCreatureYouControlEnters") {
    return event.type === "creatureEntered" && event.playerId === controller.playerId && event.sourceId !== source.instanceId;
  }

  if (condition.type === "youGainLife") {
    return event.type === "lifeGained" && event.playerId === controller.playerId;
  }

  if (condition.type === "youDrawCard") {
    return event.type === "cardDrawn" && event.playerId === controller.playerId;
  }

  if (condition.type === "youDrawSecondCard") {
    return event.type === "cardDrawn" && event.playerId === controller.playerId && controller.cardsDrawnThisTurn === 2;
  }

  if (condition.type === "thisDies") {
    return event.type === "permanentDied" && event.sourceId === source.instanceId;
  }

  if (condition.type === "creatureYouControlDies") {
    const diedPermanent = event.sourceId ? findInstance(game, event.sourceId) : null;
    return event.type === "permanentDied" && diedPermanent?.ownerId === controller.playerId;
  }

  return false;
}

function logTrigger(game: GameState, source: CardInstance): void {
  game.log.push({
    turn: game.turnNumber,
    phase: game.phase,
    message: `${source.card.name} trigger resolves.`,
  });
}

function setGameOverFromLifeLoss(game: GameState): void {
  const losers = game.players.filter((player) => player.lifeTotal <= 0);

  if (losers.length === 0 || game.status === "gameOver") {
    return;
  }

  const loserIds = losers.map((player) => player.playerId);
  const winner = game.players.find((player) => !loserIds.includes(player.playerId));
  game.status = "gameOver";
  game.phase = "gameOver";
  game.loserIds = loserIds;
  game.winnerId = winner?.playerId ?? null;
  dispatchGameEvent(game, {
    type: "gameEnded",
    playerId: game.winnerId ?? undefined,
    details: { reason: "triggeredLifeLoss" },
  });
}

function drawCards(game: GameState, player: PlayerState, amount: number, source: CardInstance): void {
  for (let index = 0; index < amount; index += 1) {
    const [drawnCard, ...remainingDeck] = player.spellDeck;

    if (!drawnCard) {
      game.status = "gameOver";
      game.phase = "gameOver";
      game.loserIds = [player.playerId];
      game.winnerId = getOpponent(game, player.playerId).playerId;
      dispatchGameEvent(game, {
        type: "gameEnded",
        playerId: game.winnerId ?? undefined,
        sourceId: source.instanceId,
        details: { reason: "triggeredDrawLoss" },
      });
      return;
    }

    player.spellDeck = remainingDeck;
    player.hand.push(drawnCard);
    player.cardsDrawnThisTurn += 1;
    dispatchGameEvent(game, {
      type: "cardDrawn",
      playerId: player.playerId,
      sourceId: drawnCard.instanceId,
      details: { cardId: drawnCard.card.id, triggerSourceId: source.instanceId },
    });
  }
}

function gainLife(game: GameState, player: PlayerState, amount: number, source: CardInstance): void {
  if (amount <= 0) {
    return;
  }

  player.lifeTotal += amount;
  dispatchGameEvent(game, {
    type: "lifeGained",
    playerId: player.playerId,
    sourceId: source.instanceId,
    amount,
    details: { triggerSourceId: source.instanceId },
  });
}

function eachOpponentLosesLife(game: GameState, controller: PlayerState, amount: number, source: CardInstance): void {
  if (amount <= 0) {
    return;
  }

  for (const player of game.players) {
    if (player.playerId === controller.playerId) {
      continue;
    }

    player.lifeTotal -= amount;
    dispatchGameEvent(game, {
      type: "damageDealt",
      playerId: controller.playerId,
      sourceId: source.instanceId,
      targetId: player.playerId,
      amount,
      details: { targetType: "player", lossOfLife: true, triggerSourceId: source.instanceId },
    });
  }

  setGameOverFromLifeLoss(game);
}

function applyTriggerEffect(
  game: GameState,
  controller: PlayerState,
  source: CardInstance,
  effect: TriggerEffect,
): void {
  if (effect.type === "drawCards") {
    drawCards(game, controller, effect.amount, source);
  }

  if (effect.type === "gainLife") {
    gainLife(game, controller, effect.amount, source);
  }

  if (effect.type === "eachOpponentLosesLife") {
    eachOpponentLosesLife(game, controller, effect.amount, source);
  }

  if (effect.type === "addPlusOneCounters" && effect.target === "source") {
    const currentSource = getBattlefieldController(game, source.instanceId)
      ?.battlefield.find((candidate) => candidate.instanceId === source.instanceId);

    if (currentSource) {
      currentSource.plusOneCounters += effect.amount;
    }
  }
}

function resolveTriggeredAbilities(game: GameState, event: GameEvent): void {
  if (game.status === "gameOver" && event.type !== "gameEnded") {
    return;
  }

  const sources = event.type === "permanentDied" ? deathTriggerSources(game, event) : battlefieldTriggerSources(game);

  for (const { controller, source } of sources) {
    if (source.losesAbilities) {
      continue;
    }

    for (const profile of getTriggeredAbilityProfiles(source.card)) {
      if (!conditionMatches(game, event, controller, source, profile.condition)) {
        continue;
      }

      logTrigger(game, source);

      for (const effect of profile.effects) {
        applyTriggerEffect(game, controller, source, effect);
      }
    }
  }
}

export function dispatchGameEvent(game: GameState, input: EmitGameEventInput): GameEvent {
  const event = emitGameEvent(game, input);
  resolveTriggeredAbilities(game, event);
  return event;
}
