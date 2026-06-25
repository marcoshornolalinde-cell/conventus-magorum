import { emitGameEvent, type EmitGameEventInput } from "./events.js";
import type { Card, CardInstance, GameEvent, GameState, PlayerId, PlayerState } from "./types.js";

type TriggerCondition =
  | { type: "thisEnters" }
  | { type: "anotherCreatureYouControlEnters" }
  | { type: "youGainLife" }
  | { type: "youDrawCard" }
  | { type: "youDrawSecondCard" }
  | { type: "thisDies" }
  | { type: "creatureYouControlDies" }
  | { type: "youControlAnotherSubtype"; subtype: string };

export type TriggerEffect =
  | { type: "drawCards"; amount: number }
  | { type: "drawThenDiscard" }
  | { type: "gainLife"; amount: number }
  | { type: "eachOpponentLosesLife"; amount: number }
  | { type: "eachOpponentDiscards"; amount: number; condition?: "opponentLostLifeThisTurn" }
  | { type: "addPlusOneCounters"; amount: number; target: "source" | "upToTwoOtherOwnCreatures" }
  | { type: "modifyCreature"; power: number; toughness: number; target: "opponentCreature" }
  | { type: "returnToHand"; target: "opponentCreature" }
  | {
      type: "createToken";
      count: number;
      token: {
        name: string;
        color: string;
        cardTypes: string[];
        subtypes: string[];
        power: string | null;
        toughness: string | null;
        keywords?: string[];
      };
    };

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

  if (/\bWhen this creature enters, draw a card\b(?!,\s*then discard)/i.test(text)) {
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

  if (
    /\bWhen this creature enters, put a \+1\/\+1 counter on each of up to two other target creatures you control\b/i.test(
      text,
    )
  ) {
    profiles.push({
      sourceText: "When this creature enters, put a +1/+1 counter on each of up to two other target creatures you control.",
      condition: { type: "thisEnters" },
      effects: [{ type: "addPlusOneCounters", amount: 1, target: "upToTwoOtherOwnCreatures" }],
    });
  }

  if (/\bWhen this creature enters, create a 1\/1 white Cat creature token\b/i.test(text)) {
    profiles.push({
      sourceText: "When this creature enters, create a 1/1 white Cat creature token.",
      condition: { type: "thisEnters" },
      effects: [
        {
          type: "createToken",
          count: 1,
          token: {
            name: "Cat Token",
            color: "White",
            cardTypes: ["Creature"],
            subtypes: ["Cat"],
            power: "1",
            toughness: "1",
          },
        },
      ],
    });
  }

  const treasureMatch = text.match(/\bWhen this creature enters, create (?:a|two) Treasure tokens?\b/i);
  if (treasureMatch) {
    profiles.push({
      sourceText: treasureMatch[0],
      condition: { type: "thisEnters" },
      effects: [
        {
          type: "createToken",
          count: /\btwo\b/i.test(treasureMatch[0]) ? 2 : 1,
          token: {
            name: "Treasure Token",
            color: "Colorless",
            cardTypes: ["Artifact"],
            subtypes: ["Treasure"],
            power: null,
            toughness: null,
          },
        },
      ],
    });
  }

  if (
    /\bWhen this creature enters, if an opponent lost life this turn, each opponent discards a card\b/i.test(text)
  ) {
    profiles.push({
      sourceText: "When this creature enters, if an opponent lost life this turn, each opponent discards a card.",
      condition: { type: "thisEnters" },
      effects: [{ type: "eachOpponentDiscards", amount: 1, condition: "opponentLostLifeThisTurn" }],
    });
  }

  if (/\bWhen this creature enters, draw a card, then discard a card\b/i.test(text)) {
    profiles.push({
      sourceText: "When this creature enters, draw a card, then discard a card.",
      condition: { type: "thisEnters" },
      effects: [{ type: "drawThenDiscard" }],
    });
  }

  if (/\bWhen this creature dies, create two 2\/2 black Zombie creature tokens\b/i.test(text)) {
    profiles.push({
      sourceText: "When this creature dies, create two 2/2 black Zombie creature tokens.",
      condition: { type: "thisDies" },
      effects: [
        {
          type: "createToken",
          count: 2,
          token: {
            name: "Zombie Token",
            color: "Black",
            cardTypes: ["Creature"],
            subtypes: ["Zombie"],
            power: "2",
            toughness: "2",
          },
        },
      ],
    });
  }

  if (/\bWhenever you draw your second card each turn, create a 1\/1 blue Faerie creature token with flying\b/i.test(text)) {
    profiles.push({
      sourceText: "Whenever you draw your second card each turn, create a 1/1 blue Faerie creature token with flying.",
      condition: { type: "youDrawSecondCard" },
      effects: [
        {
          type: "createToken",
          count: 1,
          token: {
            name: "Faerie Token",
            color: "Blue",
            cardTypes: ["Creature"],
            subtypes: ["Faerie"],
            power: "1",
            toughness: "1",
            keywords: ["Flying"],
          },
        },
      ],
    });
  }

  if (/\bWhen this creature enters, if you control another Elf, create a 1\/1 green Elf Warrior creature token\b/i.test(text)) {
    profiles.push({
      sourceText: "When this creature enters, if you control another Elf, create a 1/1 green Elf Warrior creature token.",
      condition: { type: "youControlAnotherSubtype", subtype: "Elf" },
      effects: [
        {
          type: "createToken",
          count: 1,
          token: {
            name: "Elf Warrior Token",
            color: "Green",
            cardTypes: ["Creature"],
            subtypes: ["Elf", "Warrior"],
            power: "1",
            toughness: "1",
          },
        },
      ],
    });
  }

  if (/\bWhen this creature enters, target creature an opponent controls gets -1\/-0 until end of turn\b/i.test(text)) {
    profiles.push({
      sourceText: "When this creature enters, target creature an opponent controls gets -1/-0 until end of turn.",
      condition: { type: "thisEnters" },
      effects: [{ type: "modifyCreature", power: -1, toughness: 0, target: "opponentCreature" }],
    });
  }

  if (/\bWhen this creature enters, return target creature an opponent controls to its owner's hand\b/i.test(text)) {
    profiles.push({
      sourceText: "When this creature enters, return target creature an opponent controls to its owner's hand.",
      condition: { type: "thisEnters" },
      effects: [{ type: "returnToHand", target: "opponentCreature" }],
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

function getBattlefieldCreature(player: PlayerState, instanceId: string): CardInstance | null {
  return player.battlefield.find(
    (instance) => instance.instanceId === instanceId && instance.card.cardTypes.includes("Creature"),
  ) ?? null;
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

  if (condition.type === "youControlAnotherSubtype") {
    return (
      event.type === "creatureEntered" &&
      event.sourceId === source.instanceId &&
      controller.battlefield.some(
        (candidate) =>
          candidate.instanceId !== source.instanceId &&
          candidate.card.cardTypes.includes("Creature") &&
          candidate.card.typeLine.toLowerCase().includes(condition.subtype.toLowerCase()),
      )
    );
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

function resetPermanentForHiddenZone(instance: CardInstance): void {
  instance.tapped = false;
  instance.damageMarked = 0;
  instance.deathtouchDamageMarked = 0;
  instance.powerModifier = 0;
  instance.toughnessModifier = 0;
  instance.staticPowerModifier = 0;
  instance.staticToughnessModifier = 0;
  instance.basePowerOverride = null;
  instance.baseToughnessOverride = null;
  instance.staticKeywords = [];
  instance.temporaryKeywords = [];
  instance.losesAbilities = false;
  instance.cannotAttack = false;
  instance.cannotDefend = false;
  instance.attachedToId = null;
  instance.doesNotUntap = false;
  instance.enteredTurn = null;
}

function detachAttachmentsFromPermanent(game: GameState, permanentId: string): void {
  for (const player of game.players) {
    for (const attachment of [...player.battlefield]) {
      if (attachment.attachedToId !== permanentId) {
        continue;
      }

      attachment.attachedToId = null;

      if (attachment.card.cardTypes.includes("Enchantment")) {
        player.battlefield = player.battlefield.filter((candidate) => candidate.instanceId !== attachment.instanceId);
        resetPermanentForHiddenZone(attachment);
        player.graveyard.push(attachment);
      }
    }
  }
}

function opponentLostLifeThisTurn(game: GameState, controller: PlayerState): boolean {
  return game.events.some((event) => {
    if (event.turn !== game.turnNumber || event.type !== "damageDealt" || event.amount === undefined || event.amount <= 0) {
      return false;
    }

    const targetId = event.targetId;
    return typeof targetId === "string" && targetId !== controller.playerId && game.players.some((player) => player.playerId === targetId);
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

function discardCards(game: GameState, player: PlayerState, amount: number, source: CardInstance): void {
  for (let index = 0; index < amount; index += 1) {
    const [discarded] = player.hand.splice(0, 1);

    if (!discarded) {
      return;
    }

    resetPermanentForHiddenZone(discarded);
    player.graveyard.push(discarded);
    dispatchGameEvent(game, {
      type: "cardDiscarded",
      playerId: player.playerId,
      sourceId: source.instanceId,
      targetId: discarded.instanceId,
      details: { triggerSourceId: source.instanceId },
    });
  }
}

function createToken(game: GameState, controller: PlayerState, source: CardInstance, effect: Extract<TriggerEffect, { type: "createToken" }>): void {
  for (let index = 0; index < effect.count; index += 1) {
    const tokenCard = {
      id: `token:${effect.token.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      name: effect.token.name,
      manaCost: "",
      manaValue: 0,
      colorIdentity: effect.token.color === "Colorless" ? [] : [effect.token.color],
      colorNames: effect.token.color === "Colorless" ? [] : [effect.token.color],
      typeLine: `Token ${effect.token.cardTypes.join(" ")}${effect.token.subtypes.length > 0 ? ` - ${effect.token.subtypes.join(" ")}` : ""}`,
      cardTypes: effect.token.cardTypes,
      isLand: false,
      isBasicLand: false,
      landMana: null,
      power: effect.token.power,
      toughness: effect.token.toughness,
      keywords: effect.token.keywords ?? [],
      keywordIds: [],
      oracleText: "",
      gameText: "",
    };
    const token: CardInstance = {
      instanceId: `${source.instanceId}:token:${game.events.length}:${index}`,
      ownerId: controller.playerId,
      sourceArchetypeId: source.sourceArchetypeId,
      card: tokenCard,
      isToken: true,
      tapped: false,
      damageMarked: 0,
      deathtouchDamageMarked: 0,
      powerModifier: 0,
      toughnessModifier: 0,
      staticPowerModifier: 0,
      staticToughnessModifier: 0,
      basePowerOverride: null,
      baseToughnessOverride: null,
      plusOneCounters: 0,
      staticKeywords: [],
      temporaryKeywords: [],
      losesAbilities: false,
      cannotAttack: false,
      cannotDefend: false,
      attachedToId: null,
      doesNotUntap: false,
      enteredTurn: game.turnNumber,
    };

    controller.battlefield.push(token);
    dispatchGameEvent(game, {
      type: "tokenCreated",
      playerId: controller.playerId,
      sourceId: source.instanceId,
      targetId: token.instanceId,
      details: { tokenName: effect.token.name },
    });

    if (token.card.cardTypes.includes("Creature")) {
      dispatchGameEvent(game, {
        type: "creatureEntered",
        playerId: controller.playerId,
        sourceId: token.instanceId,
        details: { cardId: token.card.id, token: true },
      });
    }
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

  if (effect.type === "drawThenDiscard") {
    drawCards(game, controller, 1, source);
    discardCards(game, controller, 1, source);
  }

  if (effect.type === "gainLife") {
    gainLife(game, controller, effect.amount, source);
  }

  if (effect.type === "eachOpponentLosesLife") {
    eachOpponentLosesLife(game, controller, effect.amount, source);
  }

  if (effect.type === "eachOpponentDiscards") {
    if (effect.condition === "opponentLostLifeThisTurn" && !opponentLostLifeThisTurn(game, controller)) {
      return;
    }

    for (const player of game.players) {
      if (player.playerId !== controller.playerId) {
        discardCards(game, player, effect.amount, source);
      }
    }
  }

  if (effect.type === "addPlusOneCounters" && effect.target === "source") {
    const currentSource = getBattlefieldController(game, source.instanceId)
      ?.battlefield.find((candidate) => candidate.instanceId === source.instanceId);

    if (currentSource) {
      currentSource.plusOneCounters += effect.amount;
    }
  }

  if (effect.type === "addPlusOneCounters" && effect.target === "upToTwoOtherOwnCreatures") {
    const targets = controller.battlefield
      .filter((candidate) => candidate.instanceId !== source.instanceId && candidate.card.cardTypes.includes("Creature"))
      .slice(0, 2);

    for (const target of targets) {
      target.plusOneCounters += effect.amount;
    }
  }

  if (effect.type === "modifyCreature" && effect.target === "opponentCreature") {
    const target = getOpponent(game, controller.playerId).battlefield.find((candidate) =>
      candidate.card.cardTypes.includes("Creature"),
    );

    if (target) {
      target.powerModifier += effect.power;
      target.toughnessModifier += effect.toughness;
    }
  }

  if (effect.type === "returnToHand" && effect.target === "opponentCreature") {
    const opponent = getOpponent(game, controller.playerId);
    const target = opponent.battlefield.find((candidate) => candidate.card.cardTypes.includes("Creature"));

    if (!target || !getBattlefieldCreature(opponent, target.instanceId)) {
      return;
    }

    opponent.battlefield = opponent.battlefield.filter((candidate) => candidate.instanceId !== target.instanceId);
    detachAttachmentsFromPermanent(game, target.instanceId);
    resetPermanentForHiddenZone(target);
    opponent.hand.push(target);
    dispatchGameEvent(game, {
      type: "permanentReturnedToHand",
      playerId: opponent.playerId,
      sourceId: source.instanceId,
      targetId: target.instanceId,
      details: { triggerSourceId: source.instanceId },
    });
  }

  if (effect.type === "createToken") {
    createToken(game, controller, source, effect);
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
