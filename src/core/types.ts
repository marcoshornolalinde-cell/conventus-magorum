export type CardId = string;
export type ArchetypeId = string;
export type PlayerId = "player1" | "player2" | string;

export interface Card {
  id: CardId;
  name: string;
  manaCost: string;
  manaValue: number;
  colorIdentity: string[];
  colorNames: string[];
  typeLine: string;
  cardTypes: string[];
  isLand: boolean;
  isBasicLand: boolean;
  landMana: string | null;
  power: string | null;
  toughness: string | null;
  keywords: string[];
  keywordIds: string[];
  oracleText: string;
  gameText: string;
}

export interface ArchetypeCard {
  cardId: CardId;
  name: string;
  quantity: number;
  order: number;
  isLand: boolean;
  isBasicLand: boolean;
  landMana: string | null;
  cardTypes: string[];
}

export interface Archetype {
  id: ArchetypeId;
  name: string;
  themeEs?: string;
  colorIdentity: string[];
  colorNames: string[];
  enabled: boolean;
  cardCount: number;
  uniqueCardCount: number;
  landCount: number;
  spellCount: number;
  cards: ArchetypeCard[];
}

export interface StartingHandRule {
  drawCount: number;
  drawFrom: "spellDeck";
  mulligan: boolean;
}

export interface MatchSetupRules {
  archetypesPerPlayer: number;
  samePlayerArchetypesMustBeDifferent: boolean;
  differentPlayersMayShareArchetypes: boolean;
  cardsPerArchetype: number;
  totalCardsPerPlayerPool: number;
  splitDecksAutomatically: boolean;
  spellDeckRule: string;
  landDeckRule: string;
  shuffleSpellDeck: boolean;
  shuffleLandDeck: boolean;
  startingHand: StartingHandRule;
  startOfGeneralTurn: {
    putTopLandFromLandDeckOntoBattlefield: boolean;
    ifLandDeckEmpty: string;
    drawFromSpellDeck: number;
  };
}

export interface ContentBundle {
  schemaVersion: number;
  cards: Card[];
  archetypes: Archetype[];
  matchSetupRules: MatchSetupRules;
  cardTextOverrides?: unknown[];
  engineTags?: unknown;
}

export interface CardInstance {
  instanceId: string;
  ownerId: PlayerId;
  sourceArchetypeId: ArchetypeId;
  card: Card;
  isToken?: boolean;
  tapped: boolean;
  damageMarked: number;
  deathtouchDamageMarked: number;
  powerModifier: number;
  toughnessModifier: number;
  staticPowerModifier: number;
  staticToughnessModifier: number;
  basePowerOverride: number | null;
  baseToughnessOverride: number | null;
  plusOneCounters: number;
  staticKeywords: string[];
  temporaryKeywords: string[];
  losesAbilities: boolean;
  cannotAttack: boolean;
  cannotDefend: boolean;
  temporaryCannotDefend: boolean;
  attachedToId: string | null;
  doesNotUntap: boolean;
  enteredTurn: number | null;
}

export interface PlayerDecks {
  playerId: PlayerId;
  archetypeIds: [ArchetypeId, ArchetypeId];
  pool: CardInstance[];
  spellDeck: CardInstance[];
  landDeck: CardInstance[];
}

export interface PlayerState extends PlayerDecks {
  lifeTotal: number;
  manaPool: ManaPool;
  cardsDrawnThisTurn: number;
  hand: CardInstance[];
  battlefield: CardInstance[];
  graveyard: CardInstance[];
  exile: CardInstance[];
}

export type ManaSymbol = "W" | "U" | "B" | "R" | "G" | "C";

export type ManaPool = Record<ManaSymbol, number>;

export type GamePhase = "setup" | "start" | "main1" | "combat" | "main2" | "final" | "gameOver";

export type GameStatus = "inProgress" | "gameOver";

export interface StackItem {
  id: string;
  controllerId: PlayerId;
  source: CardInstance;
  kind: "creatureSpell" | "nonCreatureSpell";
  targetIds: string[];
}

export type GameEventType =
  | "gameCreated"
  | "turnStarted"
  | "endStepStarted"
  | "combatStarted"
  | "combatPositioningEnded"
  | "landEntered"
  | "manaProduced"
  | "manaSpent"
  | "cardDrawn"
  | "spellCast"
  | "spellResolved"
  | "spellCountered"
  | "creatureEntered"
  | "creatureAttacked"
  | "creaturesAttacked"
  | "permanentDied"
  | "permanentExiled"
  | "permanentReturnedToHand"
  | "permanentAttached"
  | "damageDealt"
  | "lifeGained"
  | "lifePaid"
  | "cardDiscarded"
  | "cardMilled"
  | "cardReturnedToHand"
  | "plusOneCountersAdded"
  | "creatureSacrificed"
  | "tokenCreated"
  | "gameEnded";

export interface GameEvent {
  sequence: number;
  turn: number;
  phase: GamePhase;
  type: GameEventType;
  playerId?: PlayerId;
  sourceId?: string;
  targetId?: string;
  amount?: number;
  details?: Record<string, string | number | boolean | null>;
}

export interface GameLogEntry {
  turn: number;
  phase: GamePhase;
  message: string;
}

export interface CombatPlan {
  playerId: PlayerId;
  attackerIds: string[];
  defenderIds: string[];
}

export interface CombatPairing {
  attackerId: string;
  defenderIds: string[];
  defendingPlayerId: PlayerId;
}

export type AdditionalCostPayment =
  | { type: "mana"; manaCost: string }
  | { type: "discard"; cardInstanceId: string }
  | { type: "sacrificeCreature"; permanentId: string };

export interface GameState {
  id: string;
  seed: string;
  status: GameStatus;
  turnNumber: number;
  phase: GamePhase;
  activePlayerId: PlayerId;
  attackingPriorityPlayerId: PlayerId;
  players: [PlayerState, PlayerState];
  stack: StackItem[];
  winnerId: PlayerId | null;
  loserIds: PlayerId[];
  log: GameLogEntry[];
  events: GameEvent[];
}

export type LegalAction =
  | {
      type: "playCreature";
      playerId: PlayerId;
      cardInstanceId: string;
    }
  | {
      type: "castSpell";
      playerId: PlayerId;
      cardInstanceId: string;
      targetIds: string[];
      additionalCosts: AdditionalCostPayment[];
    }
  | {
      type: "pass";
      playerId: PlayerId;
    };

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
