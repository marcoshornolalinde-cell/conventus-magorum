import { emitGameEvent, type EmitGameEventInput } from "./events.js";
import type { Card, CardInstance, GameEvent, GameState, PlayerId, PlayerState } from "./types.js";

type TriggerCondition =
  | { type: "thisEnters" }
  | { type: "anotherCreatureYouControlEnters" }
  | { type: "youGainLife" }
  | { type: "youDrawCard" }
  | { type: "youDrawSecondCard" }
  | { type: "thisEntersOrDies" }
  | { type: "thisDies" }
  | { type: "creatureYouControlDies" }
  | { type: "creatureYouControlSubtypeDies"; subtype: string }
  | { type: "plusOneCountersPutOnAnotherNonSubtype"; subtype: string }
  | { type: "youControlAnotherSubtype"; subtype: string }
  | { type: "thisEntersIfYouAttackedThisTurn" }
  | { type: "youCastInstantOrFlash" }
  | { type: "youCastNoncreatureOrSubtype"; subtype: string }
  | { type: "thisDealsCombatDamageToPlayer" }
  | { type: "thisAttacks" }
  | { type: "oneOrMoreCreaturesYouControlAttack" }
  | { type: "beginningOfCombat"; minCreatures?: number }
  | { type: "beginningEndStepIfOpponentLostLifeThisTurn" }
  | { type: "combatPositioningEnded"; hasAttackingCreature?: boolean };

export type TriggerEffect =
  | { type: "drawCards"; amount: number }
  | { type: "drawThenDiscard" }
  | { type: "payLifeThenDraw"; life: number; draw: number }
  | { type: "millCards"; amount: number }
  | { type: "gainLife"; amount: number }
  | { type: "eachOpponentLosesLife"; amount: number }
  | { type: "eachOpponentDamage"; amount: number }
  | { type: "eachOpponentDiscards"; amount: number; condition?: "opponentLostLifeThisTurn" }
  | { type: "addPlusOneCounters"; amount: number; target: "source" | "upToTwoOtherOwnCreatures" | "ownSubtype"; subtype?: string }
  | { type: "modifyCreature"; power: number; toughness: number; target: "source" | "opponentCreature" | "ownAttackingCreature" }
  | { type: "damageTarget"; amount: number; target: "opponentCreatureOrPlayer" | "opponentCreature"; amountSource?: "ownSubtypeCount"; subtype?: string }
  | { type: "payManaThenPreventBlock"; mana: "R"; target: "opponentCreature" }
  | { type: "grantKeywords"; keywords: string[]; target: "ownCreatures" }
  | { type: "returnToHand"; target: "opponentCreature" }
  | { type: "returnOwnPermanentFromGraveyardToHand" }
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

  if (/\bWhen this creature enters, it deals 1 damage to any target\b/i.test(text)) {
    profiles.push({
      sourceText: "When this creature enters, it deals 1 damage to any target.",
      condition: { type: "thisEnters" },
      effects: [{ type: "damageTarget", amount: 1, target: "opponentCreatureOrPlayer" }],
    });
  }

  if (
    /\bWhen this creature enters, it deals damage to target creature an opponent controls equal to the number of Goblins you control\b/i.test(
      text,
    )
  ) {
    profiles.push({
      sourceText:
        "When this creature enters, it deals damage to target creature an opponent controls equal to the number of Goblins you control.",
      condition: { type: "thisEnters" },
      effects: [
        {
          type: "damageTarget",
          amount: 0,
          target: "opponentCreature",
          amountSource: "ownSubtypeCount",
          subtype: "Goblin",
        },
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

  const entersOrDiesMill = text.match(/\bWhen this creature enters or dies, mill (\w+) cards?\b/i);
  if (entersOrDiesMill) {
    const millAmount =
      entersOrDiesMill[1].toLowerCase() === "two" ? 2 : Number.parseInt(entersOrDiesMill[1], 10);

    profiles.push({
      sourceText: entersOrDiesMill[0],
      condition: { type: "thisEntersOrDies" },
      effects: [{ type: "millCards", amount: millAmount }],
    });
  }

  if (/\bWhen this creature enters, return target permanent card from your graveyard to your hand\b/i.test(text)) {
    profiles.push({
      sourceText: "When this creature enters, return target permanent card from your graveyard to your hand.",
      condition: { type: "thisEnters" },
      effects: [{ type: "returnOwnPermanentFromGraveyardToHand" }],
    });
  }

  if (/\bWhen this creature enters, if you attacked this turn, draw a card\b/i.test(text)) {
    profiles.push({
      sourceText: "When this creature enters, if you attacked this turn, draw a card.",
      condition: { type: "thisEntersIfYouAttackedThisTurn" },
      effects: [{ type: "drawCards", amount: 1 }],
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

  const anotherCreatureEntersPumpThis = text.match(
    /\bWhenever another creature you control enters, this creature gets \+(\d+)\/\+(\d+) until end of turn\b/i,
  );
  if (anotherCreatureEntersPumpThis) {
    profiles.push({
      sourceText: anotherCreatureEntersPumpThis[0],
      condition: { type: "anotherCreatureYouControlEnters" },
      effects: [
        {
          type: "modifyCreature",
          power: Number.parseInt(anotherCreatureEntersPumpThis[1], 10),
          toughness: Number.parseInt(anotherCreatureEntersPumpThis[2], 10),
          target: "source",
        },
      ],
    });
  }

  const beginningCombatVanguard = text.match(
    /\bAt the beginning of combat, if you control three or more creatures, .* gets \+(\d+)\/\+(\d+) until end of turn and you gain (\d+) life\b/i,
  );
  if (beginningCombatVanguard) {
    profiles.push({
      sourceText: beginningCombatVanguard[0],
      condition: { type: "beginningOfCombat", minCreatures: 3 },
      effects: [
        {
          type: "modifyCreature",
          power: Number.parseInt(beginningCombatVanguard[1], 10),
          toughness: Number.parseInt(beginningCombatVanguard[2], 10),
          target: "source",
        },
        { type: "gainLife", amount: Number.parseInt(beginningCombatVanguard[3], 10) },
      ],
    });
  }

  const attacksGainLife = text.match(/\bWhenever this creature attacks, you gain (\d+) life\b/i);
  if (attacksGainLife) {
    profiles.push({
      sourceText: attacksGainLife[0],
      condition: { type: "thisAttacks" },
      effects: [{ type: "gainLife", amount: Number.parseInt(attacksGainLife[1], 10) }],
    });
  }

  if (
    /\bWhenever this creature attacks, you may pay \{R}. If you do, target creature can't be assigned as a blocker this turn\b/i.test(
      text,
    )
  ) {
    profiles.push({
      sourceText:
        "Whenever this creature attacks, you may pay {R}. If you do, target creature can't be assigned as a blocker this turn.",
      condition: { type: "thisAttacks" },
      effects: [{ type: "payManaThenPreventBlock", mana: "R", target: "opponentCreature" }],
    });
  }

  if (/\bWhenever this creature deals combat damage to a player, put a \+1\/\+1 counter on it\b/i.test(text)) {
    profiles.push({
      sourceText: "Whenever this creature deals combat damage to a player, put a +1/+1 counter on it.",
      condition: { type: "thisDealsCombatDamageToPlayer" },
      effects: [{ type: "addPlusOneCounters", amount: 1, target: "source" }],
    });
  }

  if (/\bWhenever you cast an instant spell or a spell with flash, put a \+1\/\+1 counter on Brineborn Cutthroat\b/i.test(text)) {
    profiles.push({
      sourceText: "Whenever you cast an instant spell or a spell with flash, put a +1/+1 counter on Brineborn Cutthroat.",
      condition: { type: "youCastInstantOrFlash" },
      effects: [{ type: "addPlusOneCounters", amount: 1, target: "source" }],
    });
  }

  if (/\bWhenever you cast a noncreature or Dragon spell, this creature deals 1 damage to each opponent\b/i.test(text)) {
    profiles.push({
      sourceText: "Whenever you cast a noncreature or Dragon spell, this creature deals 1 damage to each opponent.",
      condition: { type: "youCastNoncreatureOrSubtype", subtype: "Dragon" },
      effects: [{ type: "eachOpponentDamage", amount: 1 }],
    });
  }

  if (
    /\bAt the beginning of the end step, if an opponent lost life this turn, put a \+1\/\+1 counter on target Vampire you control\b/i.test(
      text,
    )
  ) {
    profiles.push({
      sourceText:
        "At the beginning of the end step, if an opponent lost life this turn, put a +1/+1 counter on target Vampire you control.",
      condition: { type: "beginningEndStepIfOpponentLostLifeThisTurn" },
      effects: [{ type: "addPlusOneCounters", amount: 1, target: "ownSubtype", subtype: "Vampire" }],
    });
  }

  if (/\bWhenever a Vampire you control dies, you may pay 2 life. If you do, draw a card\b/i.test(text)) {
    profiles.push({
      sourceText: "Whenever a Vampire you control dies, you may pay 2 life. If you do, draw a card.",
      condition: { type: "creatureYouControlSubtypeDies", subtype: "Vampire" },
      effects: [{ type: "payLifeThenDraw", life: 2, draw: 1 }],
    });
  }

  if (/\bWhenever one or more creatures you control attack, you gain 1 life for each attacking creature\b/i.test(text)) {
    profiles.push({
      sourceText: "Whenever one or more creatures you control attack, you gain 1 life for each attacking creature.",
      condition: { type: "oneOrMoreCreaturesYouControlAttack" },
      effects: [{ type: "gainLife", amount: -1 }],
    });
  }

  const combatPositioningPump = text.match(
    /\bAt the end of the combat positioning step, target attacking creature you control gets \+(\d+)\/\+(\d+) until end of turn\b/i,
  );
  if (combatPositioningPump) {
    profiles.push({
      sourceText: combatPositioningPump[0],
      condition: { type: "combatPositioningEnded", hasAttackingCreature: true },
      effects: [
        {
          type: "modifyCreature",
          power: Number.parseInt(combatPositioningPump[1], 10),
          toughness: Number.parseInt(combatPositioningPump[2], 10),
          target: "ownAttackingCreature",
        },
      ],
    });
  }

  if (/\bWhen this creature enters, creatures you control gain double strike until end of turn\b/i.test(text)) {
    profiles.push({
      sourceText: "When this creature enters, creatures you control gain double strike until end of turn.",
      condition: { type: "thisEnters" },
      effects: [{ type: "grantKeywords", keywords: ["Double strike"], target: "ownCreatures" }],
    });
  }

  if (
    /\bWhenever one or more \+1\/\+1 counters are put on another non-Hydra creature you control, put a \+1\/\+1 counter on this creature\b/i.test(
      text,
    )
  ) {
    profiles.push({
      sourceText:
        "Whenever one or more +1/+1 counters are put on another non-Hydra creature you control, put a +1/+1 counter on this creature.",
      condition: { type: "plusOneCountersPutOnAnotherNonSubtype", subtype: "Hydra" },
      effects: [{ type: "addPlusOneCounters", amount: 1, target: "source" }],
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
  const stackSource = game.stack.find((item) => item.source.instanceId === instanceId)?.source;

  if (stackSource) {
    return stackSource;
  }

  for (const player of game.players) {
    const instance = [...player.battlefield, ...player.graveyard, ...player.exile, ...player.hand].find(
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

function hasSubtype(instance: CardInstance, subtype: string): boolean {
  return new RegExp(`\\b${subtype}\\b`, "i").test(instance.card.typeLine) || (instance.additionalSubtypes ?? []).includes(subtype);
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

  if (condition.type === "thisEntersOrDies") {
    return (
      (event.type === "creatureEntered" || event.type === "permanentDied") &&
      event.sourceId === source.instanceId
    );
  }

  if (condition.type === "thisDies") {
    return event.type === "permanentDied" && event.sourceId === source.instanceId;
  }

  if (condition.type === "creatureYouControlDies") {
    const diedPermanent = event.sourceId ? findInstance(game, event.sourceId) : null;
    return event.type === "permanentDied" && diedPermanent?.ownerId === controller.playerId;
  }

  if (condition.type === "creatureYouControlSubtypeDies") {
    const diedPermanent = event.sourceId ? findInstance(game, event.sourceId) : null;
    return (
      event.type === "permanentDied" &&
      diedPermanent?.ownerId === controller.playerId &&
      diedPermanent.card.cardTypes.includes("Creature") &&
      hasSubtype(diedPermanent, condition.subtype)
    );
  }

  if (condition.type === "plusOneCountersPutOnAnotherNonSubtype") {
    const target = event.targetId ? findInstance(game, event.targetId) : null;
    return (
      event.type === "plusOneCountersAdded" &&
      event.playerId === controller.playerId &&
      target !== null &&
      target.instanceId !== source.instanceId &&
      target.card.cardTypes.includes("Creature") &&
      !hasSubtype(target, condition.subtype)
    );
  }

  if (condition.type === "youControlAnotherSubtype") {
    return (
      event.type === "creatureEntered" &&
      event.sourceId === source.instanceId &&
      controller.battlefield.some(
        (candidate) =>
          candidate.instanceId !== source.instanceId &&
          candidate.card.cardTypes.includes("Creature") &&
          hasSubtype(candidate, condition.subtype),
      )
    );
  }

  if (condition.type === "thisEntersIfYouAttackedThisTurn") {
    return (
      event.type === "creatureEntered" &&
      event.sourceId === source.instanceId &&
      game.events.some(
        (candidate) =>
          candidate.turn === game.turnNumber &&
          candidate.type === "creatureAttacked" &&
          candidate.playerId === controller.playerId,
      )
    );
  }

  if (condition.type === "youCastInstantOrFlash") {
    const castSource = event.sourceId ? findInstance(game, event.sourceId) : null;
    return (
      event.type === "spellCast" &&
      event.playerId === controller.playerId &&
      castSource !== null &&
      (castSource.card.cardTypes.includes("Instant") || castSource.card.keywords.includes("Flash"))
    );
  }

  if (condition.type === "youCastNoncreatureOrSubtype") {
    const castSource = event.sourceId ? findInstance(game, event.sourceId) : null;
    return (
      event.type === "spellCast" &&
      event.playerId === controller.playerId &&
      castSource !== null &&
      (!castSource.card.cardTypes.includes("Creature") ||
        hasSubtype(castSource, condition.subtype))
    );
  }

  if (condition.type === "thisDealsCombatDamageToPlayer") {
    return (
      event.type === "damageDealt" &&
      event.sourceId === source.instanceId &&
      event.details?.targetType === "player" &&
      event.details.combat === true
    );
  }

  if (condition.type === "thisAttacks") {
    return event.type === "creatureAttacked" && event.sourceId === source.instanceId;
  }

  if (condition.type === "oneOrMoreCreaturesYouControlAttack") {
    return event.type === "creaturesAttacked" && event.playerId === controller.playerId && (event.amount ?? 0) > 0;
  }

  if (condition.type === "beginningOfCombat") {
    const minCreatures = condition.minCreatures ?? 0;
    const creatureCount = controller.battlefield.filter((candidate) => candidate.card.cardTypes.includes("Creature")).length;
    return event.type === "combatStarted" && creatureCount >= minCreatures;
  }

  if (condition.type === "beginningEndStepIfOpponentLostLifeThisTurn") {
    return event.type === "endStepStarted" && opponentLostLifeThisTurn(game, controller);
  }

  if (condition.type === "combatPositioningEnded") {
    const hasAttackingCreature = game.events.some(
      (candidate) => candidate.turn === game.turnNumber && candidate.type === "creatureAttacked" && candidate.playerId === controller.playerId,
    );
    return event.type === "combatPositioningEnded" && (!condition.hasAttackingCreature || hasAttackingCreature);
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
  instance.additionalSubtypes = [];
  instance.losesAbilities = false;
  instance.cannotAttack = false;
  instance.cannotDefend = false;
  instance.temporaryCannotDefend = false;
  instance.attachedToId = null;
  instance.doesNotUntap = false;
  instance.enteredTurn = null;
  instance.activatedAbilityIdsUsed = [];
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

function millCards(game: GameState, player: PlayerState, amount: number, source: CardInstance): void {
  for (let index = 0; index < amount; index += 1) {
    const [milled, ...remainingDeck] = player.spellDeck;

    if (!milled) {
      return;
    }

    player.spellDeck = remainingDeck;
    resetPermanentForHiddenZone(milled);
    player.graveyard.push(milled);
    dispatchGameEvent(game, {
      type: "cardMilled",
      playerId: player.playerId,
      sourceId: source.instanceId,
      targetId: milled.instanceId,
      details: { cardId: milled.card.id, triggerSourceId: source.instanceId },
    });
  }
}

function isPermanentCard(instance: CardInstance): boolean {
  return (
    instance.card.isLand ||
    instance.card.cardTypes.includes("Creature") ||
    instance.card.cardTypes.includes("Artifact") ||
    instance.card.cardTypes.includes("Enchantment")
  );
}

function returnOwnPermanentFromGraveyardToHand(game: GameState, player: PlayerState, source: CardInstance): void {
  const targetIndex = player.graveyard.findIndex(isPermanentCard);

  if (targetIndex === -1) {
    return;
  }

  const [returned] = player.graveyard.splice(targetIndex, 1);
  resetPermanentForHiddenZone(returned);
  player.hand.push(returned);
  dispatchGameEvent(game, {
    type: "cardReturnedToHand",
    playerId: player.playerId,
    sourceId: source.instanceId,
    targetId: returned.instanceId,
    details: { cardId: returned.card.id, from: "graveyard", triggerSourceId: source.instanceId },
  });
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
      additionalSubtypes: [],
      losesAbilities: false,
      cannotAttack: false,
      cannotDefend: false,
      temporaryCannotDefend: false,
      attachedToId: null,
      doesNotUntap: false,
      enteredTurn: game.turnNumber,
      activatedAbilityIdsUsed: [],
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

function addPlusOneCounters(
  game: GameState,
  controller: PlayerState,
  target: CardInstance,
  amount: number,
  source: CardInstance,
): void {
  if (amount <= 0) {
    return;
  }

  target.plusOneCounters += amount;
  dispatchGameEvent(game, {
    type: "plusOneCountersAdded",
    playerId: controller.playerId,
    sourceId: source.instanceId,
    targetId: target.instanceId,
    amount,
    details: { triggerSourceId: source.instanceId },
  });
}

function payLifeThenDraw(
  game: GameState,
  controller: PlayerState,
  source: CardInstance,
  life: number,
  drawAmount: number,
): void {
  if (life <= 0 || controller.lifeTotal <= life) {
    return;
  }

  controller.lifeTotal -= life;
  dispatchGameEvent(game, {
    type: "lifePaid",
    playerId: controller.playerId,
    sourceId: source.instanceId,
    amount: life,
    details: { triggerSourceId: source.instanceId },
  });
  drawCards(game, controller, drawAmount, source);
}

function payManaThenPreventBlock(
  game: GameState,
  controller: PlayerState,
  source: CardInstance,
  mana: "R",
): void {
  if (controller.manaPool[mana] <= 0) {
    return;
  }

  const target = getOpponent(game, controller.playerId).battlefield.find((candidate) =>
    candidate.card.cardTypes.includes("Creature"),
  );

  if (!target) {
    return;
  }

  controller.manaPool[mana] -= 1;
  target.temporaryCannotDefend = true;
  dispatchGameEvent(game, {
    type: "manaSpent",
    playerId: controller.playerId,
    sourceId: source.instanceId,
    amount: 1,
    details: { spent: mana, triggerSourceId: source.instanceId },
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

function hasKeyword(instance: CardInstance, keyword: string): boolean {
  const printedKeywords = instance.losesAbilities ? [] : instance.card.keywords;
  return [...printedKeywords, ...instance.staticKeywords, ...instance.temporaryKeywords].some(
    (candidate) => candidate.toLowerCase() === keyword.toLowerCase(),
  );
}

function getCreatureStats(instance: CardInstance): { power: number; toughness: number } {
  const basePower = instance.basePowerOverride ?? (Number.parseInt(instance.card.power ?? "0", 10) || 0);
  const baseToughness = instance.baseToughnessOverride ?? (Number.parseInt(instance.card.toughness ?? "0", 10) || 0);

  return {
    power: basePower + instance.plusOneCounters + instance.staticPowerModifier + instance.powerModifier,
    toughness: baseToughness + instance.plusOneCounters + instance.staticToughnessModifier + instance.toughnessModifier,
  };
}

function resetPermanentForGraveyard(instance: CardInstance): void {
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
  instance.additionalSubtypes = [];
  instance.losesAbilities = false;
  instance.cannotAttack = false;
  instance.cannotDefend = false;
  instance.temporaryCannotDefend = false;
  instance.attachedToId = null;
  instance.doesNotUntap = false;
  instance.activatedAbilityIdsUsed = [];
}

function moveCreatureToGraveyardFromTrigger(game: GameState, controller: PlayerState, creature: CardInstance): void {
  controller.battlefield = controller.battlefield.filter((candidate) => candidate.instanceId !== creature.instanceId);
  detachAttachmentsFromPermanent(game, creature.instanceId);
  resetPermanentForGraveyard(creature);
  controller.graveyard.push(creature);
  dispatchGameEvent(game, {
    type: "permanentDied",
    playerId: controller.playerId,
    sourceId: creature.instanceId,
    details: { cardId: creature.card.id },
  });
}

function applyLifelinkFromTriggerDamage(game: GameState, source: CardInstance, amount: number): void {
  if (amount <= 0 || !hasKeyword(source, "Lifelink")) {
    return;
  }

  gainLife(game, getPlayer(game, source.ownerId), amount, source);
}

function dealTriggerDamageToCreature(game: GameState, source: CardInstance, target: CardInstance, amount: number): void {
  if (amount <= 0) {
    return;
  }

  const controller = getBattlefieldController(game, target.instanceId);

  if (!controller) {
    return;
  }

  target.damageMarked += amount;
  if (hasKeyword(source, "Deathtouch")) {
    target.deathtouchDamageMarked += amount;
  }
  applyLifelinkFromTriggerDamage(game, source, amount);
  dispatchGameEvent(game, {
    type: "damageDealt",
    playerId: source.ownerId,
    sourceId: source.instanceId,
    targetId: target.instanceId,
    amount,
    details: { targetType: "creature" },
  });

  const lethal =
    !hasKeyword(target, "Indestructible") &&
    (target.damageMarked >= getCreatureStats(target).toughness || target.deathtouchDamageMarked > 0);
  if (lethal) {
    moveCreatureToGraveyardFromTrigger(game, controller, target);
  }
}

function dealTriggerDamageToPlayer(game: GameState, source: CardInstance, target: PlayerState, amount: number): void {
  if (amount <= 0) {
    return;
  }

  target.lifeTotal -= amount;
  applyLifelinkFromTriggerDamage(game, source, amount);
  dispatchGameEvent(game, {
    type: "damageDealt",
    playerId: source.ownerId,
    sourceId: source.instanceId,
    targetId: target.playerId,
    amount,
    details: { targetType: "player" },
  });
  setGameOverFromLifeLoss(game);
}

function countOwnSubtype(controller: PlayerState, subtype: string): number {
  return controller.battlefield.filter(
    (candidate) =>
      candidate.card.cardTypes.includes("Creature") &&
      hasSubtype(candidate, subtype),
  ).length;
}

function resolveDamageTarget(
  game: GameState,
  controller: PlayerState,
  source: CardInstance,
  effect: Extract<TriggerEffect, { type: "damageTarget" }>,
): void {
  const amount =
    effect.amountSource === "ownSubtypeCount" && effect.subtype
      ? countOwnSubtype(controller, effect.subtype)
      : effect.amount;

  const opponent = getOpponent(game, controller.playerId);
  const targetCreature = opponent.battlefield.find((candidate) => candidate.card.cardTypes.includes("Creature"));

  if (targetCreature) {
    dealTriggerDamageToCreature(game, source, targetCreature, amount);
    return;
  }

  if (effect.target === "opponentCreatureOrPlayer") {
    dealTriggerDamageToPlayer(game, source, opponent, amount);
  }
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

  if (effect.type === "payLifeThenDraw") {
    payLifeThenDraw(game, controller, source, effect.life, effect.draw);
  }

  if (effect.type === "millCards") {
    millCards(game, controller, effect.amount, source);
  }

  if (effect.type === "gainLife") {
    const attackEvent = [...game.events]
      .reverse()
      .find((event) => event.turn === game.turnNumber && event.type === "creaturesAttacked" && event.playerId === controller.playerId);
    const amount = effect.amount === -1 ? Math.max(0, attackEvent?.amount ?? 0) : effect.amount;
    gainLife(game, controller, amount, source);
  }

  if (effect.type === "eachOpponentLosesLife") {
    eachOpponentLosesLife(game, controller, effect.amount, source);
  }

  if (effect.type === "eachOpponentDamage") {
    for (const player of game.players) {
      if (player.playerId !== controller.playerId) {
        dealTriggerDamageToPlayer(game, source, player, effect.amount);
      }
    }
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
      addPlusOneCounters(game, controller, currentSource, effect.amount, source);
    }
  }

  if (effect.type === "addPlusOneCounters" && effect.target === "upToTwoOtherOwnCreatures") {
    const targets = controller.battlefield
      .filter((candidate) => candidate.instanceId !== source.instanceId && candidate.card.cardTypes.includes("Creature"))
      .slice(0, 2);

    for (const target of targets) {
      addPlusOneCounters(game, controller, target, effect.amount, source);
    }
  }

  if (effect.type === "addPlusOneCounters" && effect.target === "ownSubtype" && effect.subtype) {
    const target = controller.battlefield.find(
      (candidate) =>
        candidate.card.cardTypes.includes("Creature") &&
        hasSubtype(candidate, effect.subtype!),
    );

    if (target) {
      addPlusOneCounters(game, controller, target, effect.amount, source);
    }
  }

  if (effect.type === "modifyCreature" && effect.target === "source") {
    const currentSource = getBattlefieldController(game, source.instanceId)
      ?.battlefield.find((candidate) => candidate.instanceId === source.instanceId);

    if (currentSource) {
      currentSource.powerModifier += effect.power;
      currentSource.toughnessModifier += effect.toughness;
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

  if (effect.type === "modifyCreature" && effect.target === "ownAttackingCreature") {
    const attackingIds = new Set(
      game.events
        .filter((event) => event.turn === game.turnNumber && event.type === "creatureAttacked" && event.playerId === controller.playerId)
        .map((event) => event.sourceId)
        .filter((sourceId): sourceId is string => typeof sourceId === "string"),
    );
    const target = controller.battlefield.find((candidate) => attackingIds.has(candidate.instanceId));

    if (target) {
      target.powerModifier += effect.power;
      target.toughnessModifier += effect.toughness;
    }
  }

  if (effect.type === "damageTarget") {
    resolveDamageTarget(game, controller, source, effect);
  }

  if (effect.type === "payManaThenPreventBlock") {
    payManaThenPreventBlock(game, controller, source, effect.mana);
  }

  if (effect.type === "grantKeywords" && effect.target === "ownCreatures") {
    for (const creature of controller.battlefield.filter((candidate) => candidate.card.cardTypes.includes("Creature"))) {
      creature.temporaryKeywords.push(...effect.keywords);
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

  if (effect.type === "returnOwnPermanentFromGraveyardToHand") {
    returnOwnPermanentFromGraveyardToHand(game, controller, source);
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
