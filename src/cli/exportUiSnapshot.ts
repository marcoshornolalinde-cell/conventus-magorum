import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { loadContentBundle } from "../data/loadContent.js";
import { runSelfplay, SelfplayRuntimeError } from "../selfplay/runMatch.js";
import { chooseBasicCombatPlan, chooseFirstPlayableCreature } from "../ai/heuristicAI.js";
import { createInitialGame, type InitialPlayerConfig } from "../core/gameState.js";
import {
  beginGeneralTurn,
  cleanupGeneralTurn,
  runCombat,
  runMainPhase,
} from "../core/turn.js";
import type { CardInstance, GameLogEntry, GamePhase, GameState, PlayerId, PlayerState } from "../core/types.js";

interface UiCard {
  instanceId: string;
  cardId: string;
  name: string;
  manaCost: string;
  manaValue: number;
  typeLine: string;
  cardTypes: string[];
  colorIdentity: string[];
  colorNames: string[];
  isLand: boolean;
  power: string | null;
  toughness: string | null;
  keywords: string[];
  gameText: string;
  isToken: boolean;
  tapped: boolean;
  damageMarked: number;
  deathtouchDamageMarked: number;
  powerModifier: number;
  toughnessModifier: number;
  staticPowerModifier: number;
  staticToughnessModifier: number;
  plusOneCounters: number;
  temporaryKeywords: string[];
  staticKeywords: string[];
  additionalSubtypes: string[];
  attachedToId: string | null;
  exiledById: string | null;
  enteredTurn: number | null;
}

interface UiPlayer {
  playerId: PlayerId;
  archetypeIds: [string, string];
  lifeTotal: number;
  manaPool: PlayerState["manaPool"];
  hand: UiCard[];
  battlefield: UiCard[];
  graveyard: UiCard[];
  exile: UiCard[];
  spellDeckCount: number;
  landDeckCount: number;
}

interface UiSnapshot {
  generatedAt: string;
  seed: string;
  maxTurns: number;
  game: {
    id: string;
    status: GameState["status"];
    phase: GamePhase;
    turnNumber: number;
    winnerId: PlayerId | null;
    loserIds: PlayerId[];
    attackingPriorityPlayerId: PlayerId;
    reachedTurnLimit: boolean;
  };
  players: UiPlayer[];
  stack: UiCard[];
  log: GameLogEntry[];
  eventSummary: {
    total: number;
    damageEvents: number;
    abilityActivations: number;
    spellsCast: number;
    creaturesAttacked: number;
  };
}

interface UiReplayState extends UiSnapshot {
  stateIndex: number;
  label: string;
}

interface UiReplayFrame {
  label: string;
  frameIndex: number;
  stateIndex: number;
  newLog: GameLogEntry[];
}

function readArgValue(args: string[], name: string, fallback: string): string {
  const arg = args.find((candidate) => candidate.startsWith(`--${name}=`));
  return arg?.slice(name.length + 3) || fallback;
}

function readPlayerConfig(args: string[], name: "player1" | "player2"): InitialPlayerConfig | null {
  const value = readArgValue(args, name, "");

  if (!value) {
    return null;
  }

  const archetypeIds = value
    .split(/[+,|]/)
    .map((archetypeId) => archetypeId.trim())
    .filter(Boolean);

  if (archetypeIds.length !== 2) {
    throw new Error(`--${name} must contain exactly two archetype ids, for example --${name}=wizards,healing.`);
  }

  return {
    id: name,
    archetypeIds: [archetypeIds[0], archetypeIds[1]],
  };
}

function cardToUiCard(instance: CardInstance): UiCard {
  return {
    instanceId: instance.instanceId,
    cardId: instance.card.id,
    name: instance.card.name,
    manaCost: instance.card.manaCost,
    manaValue: instance.card.manaValue,
    typeLine: instance.card.typeLine,
    cardTypes: instance.card.cardTypes,
    colorIdentity: instance.card.colorIdentity,
    colorNames: instance.card.colorNames,
    isLand: instance.card.isLand,
    power: instance.card.power,
    toughness: instance.card.toughness,
    keywords: instance.card.keywords,
    gameText: instance.card.gameText,
    isToken: instance.isToken === true,
    tapped: instance.tapped,
    damageMarked: instance.damageMarked,
    deathtouchDamageMarked: instance.deathtouchDamageMarked,
    powerModifier: instance.powerModifier,
    toughnessModifier: instance.toughnessModifier,
    staticPowerModifier: instance.staticPowerModifier,
    staticToughnessModifier: instance.staticToughnessModifier,
    plusOneCounters: instance.plusOneCounters,
    temporaryKeywords: instance.temporaryKeywords,
    staticKeywords: instance.staticKeywords,
    additionalSubtypes: instance.additionalSubtypes ?? [],
    attachedToId: instance.attachedToId,
    exiledById: instance.exiledById ?? null,
    enteredTurn: instance.enteredTurn,
  };
}

function playerToUiPlayer(player: PlayerState): UiPlayer {
  return {
    playerId: player.playerId,
    archetypeIds: player.archetypeIds,
    lifeTotal: player.lifeTotal,
    manaPool: player.manaPool,
    hand: player.hand.map(cardToUiCard),
    battlefield: player.battlefield.map(cardToUiCard),
    graveyard: player.graveyard.map(cardToUiCard),
    exile: player.exile.map(cardToUiCard),
    spellDeckCount: player.spellDeck.length,
    landDeckCount: player.landDeck.length,
  };
}

function hasGameEnded(game: GameState): boolean {
  return game.status === "gameOver";
}

function snapshotFromGame(game: GameState, seed: string, maxTurns: number, reachedTurnLimit: boolean): UiSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    seed,
    maxTurns,
    game: {
      id: game.id,
      status: game.status,
      phase: game.phase,
      turnNumber: game.turnNumber,
      winnerId: game.winnerId,
      loserIds: game.loserIds,
      attackingPriorityPlayerId: game.attackingPriorityPlayerId,
      reachedTurnLimit,
    },
    players: game.players.map(playerToUiPlayer),
    stack: game.stack.map((item) => cardToUiCard(item.source)),
    log: game.log,
    eventSummary: {
      total: game.events.length,
      damageEvents: game.events.filter((event) => event.type === "damageDealt").length,
      abilityActivations: game.events.filter((event) => event.type === "abilityActivated").length,
      spellsCast: game.events.filter((event) => event.type === "spellCast").length,
      creaturesAttacked: game.events.filter((event) => event.type === "creatureAttacked").length,
    },
  };
}

function createSnapshot(
  seed: string,
  maxTurns: number,
  players?: [InitialPlayerConfig, InitialPlayerConfig],
): UiSnapshot {
  const content = loadContentBundle();
  const result = runSelfplay(content, { seed, maxTurns, players });
  return snapshotFromGame(result.game, seed, maxTurns, result.reachedTurnLimit);
}

function createReplay(
  seed: string,
  maxTurns: number,
  players?: [InitialPlayerConfig, InitialPlayerConfig],
): { states: UiReplayState[]; frames: UiReplayFrame[] } {
  const content = loadContentBundle();
  const game = createInitialGame(content, { seed, players });
  const states: UiReplayState[] = [];
  const frames: UiReplayFrame[] = [];
  let previousLogLength = 0;

  function capture(label: string, reachedTurnLimit = false): void {
    const snapshot = snapshotFromGame(game, seed, maxTurns, reachedTurnLimit);
    const stateIndex = states.length;
    states.push({
      ...snapshot,
      stateIndex,
      label,
    });
    const newLog = game.log.slice(previousLogLength);

    if (newLog.length === 0) {
      frames.push({
        frameIndex: frames.length,
        stateIndex,
        label,
        newLog: [],
      });
    } else {
      for (const entry of newLog) {
        frames.push({
          frameIndex: frames.length,
          stateIndex,
          label,
          newLog: [entry],
        });
      }
    }

    previousLogLength = game.log.length;
  }

  capture("Partida preparada");

  while (!hasGameEnded(game) && game.turnNumber < maxTurns) {
    beginGeneralTurn(game);
    capture(`Turno ${game.turnNumber}: inicio`);

    if (hasGameEnded(game)) {
      break;
    }

    runMainPhase(game, "main1", chooseFirstPlayableCreature);
    capture(`Turno ${game.turnNumber}: fase principal 1`);

    runCombat(game, chooseBasicCombatPlan, chooseFirstPlayableCreature);
    capture(`Turno ${game.turnNumber}: combate`);

    if (hasGameEnded(game)) {
      break;
    }

    runMainPhase(game, "main2", chooseFirstPlayableCreature);
    capture(`Turno ${game.turnNumber}: fase principal 2`);

    cleanupGeneralTurn(game);
    capture(`Turno ${game.turnNumber}: limpieza`);
  }

  if (!hasGameEnded(game) && game.turnNumber >= maxTurns) {
    const finalState = states[states.length - 1];
    finalState.game.reachedTurnLimit = true;
  }

  return { states, frames };
}

function writeSnapshot(
  snapshot: UiSnapshot,
  replayStates: UiReplayState[],
  replayFrames: UiReplayFrame[],
  outputPath: string,
): void {
  mkdirSync(dirname(outputPath), { recursive: true });
  const serialized = JSON.stringify(snapshot, null, 2);
  const serializedReplayStates = JSON.stringify(replayStates, null, 2);
  const serializedReplayFrames = JSON.stringify(replayFrames, null, 2);
  writeFileSync(
    outputPath,
    `window.CONVENTUS_MATCH = ${serialized};\nwindow.CONVENTUS_REPLAY_STATES = ${serializedReplayStates};\nwindow.CONVENTUS_REPLAY = ${serializedReplayFrames};\n`,
    "utf8",
  );
}

const args = process.argv.slice(2);
const seed = readArgValue(args, "seed", "ui-demo-seed");
const maxTurns = Number.parseInt(readArgValue(args, "maxTurns", "20"), 10);
const output = resolve(readArgValue(args, "out", "web/state/live-match.js"));
const player1 = readPlayerConfig(args, "player1");
const player2 = readPlayerConfig(args, "player2");
const players = player1 && player2 ? [player1, player2] as [InitialPlayerConfig, InitialPlayerConfig] : undefined;

try {
  const replay = createReplay(seed, maxTurns, players);
  const snapshot = replay.states[replay.states.length - 1] ?? createSnapshot(seed, maxTurns, players);
  writeSnapshot(snapshot, replay.states, replay.frames, output);
  console.log(`UI snapshot written: ${output}`);
  console.log(`Seed: ${snapshot.seed}`);
  console.log(`Replay states: ${replay.states.length}`);
  console.log(`Replay frames: ${replay.frames.length}`);
  console.log(`Turn: ${snapshot.game.turnNumber}`);
  console.log(`Status: ${snapshot.game.status}`);
  console.log(`Winner: ${snapshot.game.winnerId ?? "none"}`);
} catch (error) {
  if (error instanceof SelfplayRuntimeError) {
    console.error(error.message);
    console.error(JSON.stringify(error.diagnostic, null, 2));
    process.exitCode = 1;
  } else {
    throw error;
  }
}
