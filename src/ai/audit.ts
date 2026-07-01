import { chooseActionWithPolicy } from "./heuristicAI.js";
import {
  chooseCombatPlanWithPolicy,
  defaultAiPolicyWeights,
  explainLegalActions,
  getSpellIntentTags,
  scoreLegalAction,
  type AiDecisionFeatures,
  type AiPolicyWeights,
} from "./policy.js";
import { getCreaturesOnBattlefield } from "../core/combat.js";
import { createInitialGame, type InitialPlayerConfig } from "../core/gameState.js";
import { createSeededRandom } from "../core/random.js";
import { playOneGeneralTurn } from "../core/turn.js";
import type { ArchetypeId, CombatPlan, ContentBundle, GamePhase, GameState, LegalAction, PlayerId } from "../core/types.js";

export interface AiAuditOptions {
  games?: number;
  seed?: string;
  maxTurns?: number;
  sampleLimit?: number;
  weights?: AiPolicyWeights;
}

export interface AiDecisionSample {
  gameIndex: number;
  seed: string;
  turn: number;
  phase: GamePhase;
  playerId: PlayerId;
  chosen: AiDecisionFeatures;
  legalActionCount: number;
  nonManaOptionCount: number;
  topOptions: AiDecisionFeatures[];
  issueTags: string[];
}

export interface AiAuditGameSummary {
  gameIndex: number;
  seed: string;
  players: [InitialPlayerConfig, InitialPlayerConfig];
  winnerId: PlayerId | null;
  status: GameState["status"];
  turns: number;
  issueCounts: Record<string, number>;
}

export interface AiAuditReport {
  games: number;
  completedGames: number;
  gameOvers: number;
  seed: string;
  maxTurns: number;
  weights: AiPolicyWeights;
  tunableParameters: string[];
  issueCounts: Record<string, number>;
  actionCounts: Record<string, number>;
  spellTagCounts: Record<string, number>;
  samples: AiDecisionSample[];
  gameSummaries: AiAuditGameSummary[];
  errors: string[];
}

const knownIssues = [
  "passed_with_non_mana_options",
  "combat_trick_outside_combat_window",
  "all_in_no_defense_left",
  "risky_draw_near_deckout",
  "zero_score_non_mana_options",
] as const;

function createEmptyIssueCounts(): Record<string, number> {
  return Object.fromEntries(knownIssues.map((issue) => [issue, 0]));
}

function increment(map: Record<string, number>, key: string, amount = 1): void {
  map[key] = (map[key] ?? 0) + amount;
}

function pickDistinctArchetypes(archetypes: ArchetypeId[], random: () => number, count: number): ArchetypeId[] {
  const shuffled = [...archetypes];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled.slice(0, count);
}

function createPlayers(archetypes: ArchetypeId[], random: () => number): [InitialPlayerConfig, InitialPlayerConfig] {
  const [first, second, third, fourth] = pickDistinctArchetypes(archetypes, random, 4);

  return [
    { id: "player1", archetypeIds: [first, second] },
    { id: "player2", archetypeIds: [third, fourth] },
  ];
}

function getPlayer(game: GameState, playerId: PlayerId) {
  const player = game.players.find((candidate) => candidate.playerId === playerId);

  if (!player) {
    throw new Error(`Unknown player ${playerId}.`);
  }

  return player;
}

function getOpponent(game: GameState, playerId: PlayerId) {
  const opponent = game.players.find((candidate) => candidate.playerId !== playerId);

  if (!opponent) {
    throw new Error(`Player ${playerId} has no opponent.`);
  }

  return opponent;
}

function detectActionIssues(game: GameState, playerId: PlayerId, legalActions: LegalAction[], chosen: LegalAction): string[] {
  const issues: string[] = [];
  const player = getPlayer(game, playerId);
  const nonManaOptions = legalActions.filter((action) => action.type !== "pass" && action.type !== "activateManaAbility");
  const nonManaScores = nonManaOptions.map((action) => scoreLegalAction(game, playerId, action));
  const actionableNonManaScores = nonManaScores.filter((features) => features.score > 0);
  const onlyHeldCombatTricks =
    nonManaScores.length > 0 &&
    nonManaScores.every((features) => features.tags.includes("combatTrick") && features.score <= 0);

  if (chosen.type === "pass" && actionableNonManaScores.length > 0) {
    issues.push("passed_with_non_mana_options");
  }

  if (nonManaOptions.length > 0 && actionableNonManaScores.length === 0 && !onlyHeldCombatTricks) {
    issues.push("zero_score_non_mana_options");
  }

  if (chosen.type === "castSpell") {
    const card = player.hand.find((candidate) => candidate.instanceId === chosen.cardInstanceId);
    const tags = card ? getSpellIntentTags(card.card) : [];

    if (tags.includes("combatTrick") && game.phase !== "combat") {
      issues.push("combat_trick_outside_combat_window");
    }

    if ((tags.includes("cardDraw") || tags.includes("cardSelection")) && player.spellDeck.length <= 2) {
      issues.push("risky_draw_near_deckout");
    }
  }

  return issues;
}

function detectCombatIssues(game: GameState, playerId: PlayerId, plan: CombatPlan): string[] {
  const player = getPlayer(game, playerId);
  const opponent = getOpponent(game, playerId);
  const opponentCreatures = getCreaturesOnBattlefield(opponent).length;

  if (plan.attackerIds.length > 0 && plan.defenderIds.length === 0 && player.lifeTotal <= 10 && opponentCreatures > 0) {
    return ["all_in_no_defense_left"];
  }

  return [];
}

function sortedTopOptions(features: AiDecisionFeatures[]): AiDecisionFeatures[] {
  return [...features]
    .filter((feature) => feature.actionType !== "activateManaAbility" && feature.actionType !== "pass")
    .sort((first, second) => second.score - first.score)
    .slice(0, 5);
}

function recordIssues(globalIssues: Record<string, number>, gameIssues: Record<string, number>, issues: string[]): void {
  for (const issue of issues) {
    increment(globalIssues, issue);
    increment(gameIssues, issue);
  }
}

export function auditAiGames(content: ContentBundle, options: AiAuditOptions = {}): AiAuditReport {
  const games = options.games ?? 10;
  const seed = options.seed ?? "ai-review";
  const maxTurns = options.maxTurns ?? 40;
  const sampleLimit = options.sampleLimit ?? 300;
  const weights = options.weights ?? defaultAiPolicyWeights;
  const random = createSeededRandom(seed);
  const archetypes = content.archetypes.map((archetype) => archetype.id);
  const issueCounts = createEmptyIssueCounts();
  const actionCounts: Record<string, number> = {};
  const spellTagCounts: Record<string, number> = {};
  const samples: AiDecisionSample[] = [];
  const gameSummaries: AiAuditGameSummary[] = [];
  const errors: string[] = [];
  let completedGames = 0;
  let gameOvers = 0;

  for (let gameIndex = 0; gameIndex < games; gameIndex += 1) {
    const gameSeed = `${seed}:${gameIndex}`;
    const players = createPlayers(archetypes, random);
    const gameIssueCounts = createEmptyIssueCounts();

    try {
      const game = createInitialGame(content, { seed: gameSeed, players });

      const chooseAction = (currentGame: GameState, playerId: PlayerId, legalActions: LegalAction[]): LegalAction => {
        const chosen = chooseActionWithPolicy(currentGame, playerId, legalActions, weights);
        const chosenFeatures = scoreLegalAction(currentGame, playerId, chosen, weights);
        const issues = detectActionIssues(currentGame, playerId, legalActions, chosen);
        const topOptions = sortedTopOptions(explainLegalActions(currentGame, playerId, legalActions, weights));

        increment(actionCounts, chosen.type);
        for (const tag of chosenFeatures.tags) {
          increment(spellTagCounts, tag);
        }
        recordIssues(issueCounts, gameIssueCounts, issues);

        if (samples.length < sampleLimit && (issues.length > 0 || chosenFeatures.score > 0)) {
          samples.push({
            gameIndex,
            seed: gameSeed,
            turn: currentGame.turnNumber,
            phase: currentGame.phase,
            playerId,
            chosen: chosenFeatures,
            legalActionCount: legalActions.length,
            nonManaOptionCount: legalActions.filter((action) => action.type !== "pass" && action.type !== "activateManaAbility").length,
            topOptions,
            issueTags: issues,
          });
        }

        return chosen;
      };

      const chooseCombatPlan = (currentGame: GameState, playerId: PlayerId): CombatPlan => {
        const plan = chooseCombatPlanWithPolicy(currentGame, playerId, weights);
        const issues = detectCombatIssues(currentGame, playerId, plan);
        recordIssues(issueCounts, gameIssueCounts, issues);
        return plan;
      };

      while (game.status !== "gameOver" && game.turnNumber < maxTurns) {
        playOneGeneralTurn(game, chooseAction, chooseCombatPlan);
      }

      completedGames += 1;
      if (game.status === "gameOver") {
        gameOvers += 1;
      }

      gameSummaries.push({
        gameIndex,
        seed: gameSeed,
        players,
        winnerId: game.winnerId,
        status: game.status,
        turns: game.turnNumber,
        issueCounts: gameIssueCounts,
      });
    } catch (error) {
      errors.push(error instanceof Error ? `${gameSeed}: ${error.message}` : `${gameSeed}: ${String(error)}`);
    }
  }

  return {
    games,
    completedGames,
    gameOvers,
    seed,
    maxTurns,
    weights,
    tunableParameters: Object.keys(weights),
    issueCounts,
    actionCounts,
    spellTagCounts,
    samples,
    gameSummaries,
    errors,
  };
}
