import type { ArchetypeId, ContentBundle, GameState, PlayerId, PlayerState } from "./types.js";
import { createSeededRandom } from "./random.js";
import { createEmptyManaPool } from "./mana.js";
import { assertGameStateIsValid } from "./validateGameState.js";
import { emitGameEvent } from "./events.js";
import { assertContentBundleIsValid } from "../data/validateContent.js";
import { createPlayerDecks } from "../data/buildDecks.js";

export interface InitialPlayerConfig {
  id: PlayerId;
  archetypeIds: [ArchetypeId, ArchetypeId];
}

export interface CreateInitialGameOptions {
  seed?: string;
  players?: [InitialPlayerConfig, InitialPlayerConfig];
}

function defaultPlayerConfigs(content: ContentBundle): [InitialPlayerConfig, InitialPlayerConfig] {
  if (content.archetypes.length < 4) {
    throw new Error("At least 4 archetypes are needed to create the default initial game.");
  }

  return [
    {
      id: "player1",
      archetypeIds: [content.archetypes[0].id, content.archetypes[1].id],
    },
    {
      id: "player2",
      archetypeIds: [content.archetypes[2].id, content.archetypes[3].id],
    },
  ];
}

function createInitialPlayerState(content: ContentBundle, config: InitialPlayerConfig, seed: string): PlayerState {
  const decks = createPlayerDecks(content, config.id, config.archetypeIds, seed);
  const drawCount = content.matchSetupRules.startingHand.drawCount;
  const hand = decks.spellDeck.slice(0, drawCount);
  const spellDeck = decks.spellDeck.slice(drawCount);

  return {
    ...decks,
    spellDeck,
    lifeTotal: 20,
    manaPool: createEmptyManaPool(),
    dragonHasteMana: 0,
    cardsDrawnThisTurn: 0,
    hand,
    battlefield: [],
    graveyard: [],
    exile: [],
  };
}

function chooseInitialAttackingPriorityPlayerId(players: [PlayerState, PlayerState], seed: string): PlayerId {
  const random = createSeededRandom(`${seed}:attackingPriority`);
  return players[Math.floor(random() * players.length)].playerId;
}

export function createInitialGame(content: ContentBundle, options: CreateInitialGameOptions = {}): GameState {
  assertContentBundleIsValid(content);

  const seed = options.seed ?? "default-seed";
  const players = options.players ?? defaultPlayerConfigs(content);
  const playerStates = players.map((player) => createInitialPlayerState(content, player, seed)) as [
    PlayerState,
    PlayerState,
  ];
  const attackingPriorityPlayerId = chooseInitialAttackingPriorityPlayerId(playerStates, seed);

  const game: GameState = {
    id: `game:${seed}`,
    seed,
    status: "inProgress",
    turnNumber: 0,
    phase: "setup",
    activePlayerId: attackingPriorityPlayerId,
    attackingPriorityPlayerId,
    players: playerStates,
    stack: [],
    winnerId: null,
    loserIds: [],
    exileOnDeathUntilEndOfTurn: [],
    log: [
      {
        turn: 0,
        phase: "setup",
        message: "Initial game created.",
      },
    ],
    events: [],
  };

  emitGameEvent(game, {
    type: "gameCreated",
    playerId: attackingPriorityPlayerId,
    details: { seed },
  });
  assertGameStateIsValid(game, "initial game");
  return game;
}
