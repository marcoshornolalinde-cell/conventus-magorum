import { chooseActionWithPolicy } from "./heuristicAI.js";
import { chooseCombatPlanWithPolicy, defaultAiPolicyWeights, type AiPolicyWeights } from "./policy.js";
import { createInitialGame, type InitialPlayerConfig } from "../core/gameState.js";
import { createSeededRandom } from "../core/random.js";
import { playOneGeneralTurn } from "../core/turn.js";
import type { ArchetypeId, CombatPlan, ContentBundle, GameState, LegalAction, PlayerId } from "../core/types.js";

export interface AiTrainingOptions {
  seed?: string;
  minutes?: number;
  gamesPerCandidate?: number;
  validationGamesPerCandidate?: number;
  validationMinScoreDelta?: number;
  maxTurns?: number;
  mutationRate?: number;
  candidatesPerGeneration?: number;
}

export interface AiTrainingEvaluation {
  score: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  winrate: number;
  avgTurns: number;
  issuePenalty: number;
  issueCounts: Record<string, number>;
}

export interface AiTrainingCandidate {
  generation: number;
  candidateIndex: number;
  weights: AiPolicyWeights;
  evaluation: AiTrainingEvaluation;
  validationEvaluation?: AiTrainingEvaluation;
}

export interface AiTrainingResult {
  seed: string;
  elapsedMs: number;
  generations: number;
  evaluatedCandidates: number;
  baseline: AiTrainingCandidate;
  best: AiTrainingCandidate;
  history: AiTrainingCandidate[];
  options: Required<AiTrainingOptions>;
}

const weightBounds: Record<keyof AiPolicyWeights, [number, number]> = {
  spellPlayWeight: [0, 120],
  creaturePlayWeight: [0, 140],
  manaEfficiencyWeight: [0, 30],
  handPressureWeight: [0, 30],
  removalTargetThreatWeight: [0, 160],
  removalSaveForBiggerThreatWeight: [0, 80],
  combatTrickHoldWeight: [0, 80],
  combatTrickLethalWeight: [0, 160],
  combatTrickSaveCreatureWeight: [0, 120],
  attackLifePressureWeight: [0, 80],
  attackTradeValueWeight: [0, 80],
  attackRiskWeight: [0, 80],
  leaveBlockerWeight: [0, 80],
  evasionAttackWeight: [0, 120],
  lifelinkAttackWeight: [0, 80],
  trampleAttackWeight: [0, 80],
  deathtouchBlockWeight: [0, 100],
  firstStrikeTradeWeight: [0, 100],
  activatedDrawWeight: [0, 120],
  activatedDrawDeckoutPenalty: [0, 120],
  graveyardRecursionWeight: [0, 120],
  tokenCreationWeight: [0, 120],
  pumpTargetQualityWeight: [0, 80],
  auraEquipmentTimingWeight: [0, 120],
  instantSpeedPatienceWeight: [0, 120],
  lethalDetectionWeight: [0, 220],
  survivalDetectionWeight: [0, 180],
  strategyAggroCreatureDeploymentWeight: [0, 120],
  strategyAggroAttackWeight: [0, 100],
  strategyControlInteractionWeight: [0, 120],
  strategyControlThreatPatienceWeight: [0, 100],
  strategyControlResourceWeight: [0, 120],
  strategyTempoAccelerationWeight: [0, 140],
  strategyTempoThreatDeploymentWeight: [0, 120],
  strategyRaceAttackWeight: [0, 120],
  strategyStabilizeBlockerWeight: [0, 120],
  strategyResourceDevelopmentWeight: [0, 120],
  matchupBeatdownPressureWeight: [0, 140],
  matchupControlAnswerWeight: [0, 140],
  matchupControlBlockerWeight: [0, 120],
  manaCurveDevelopmentWeight: [0, 100],
  cardAdvantagePreservationWeight: [0, 120],
  lethalSetupRemovalWeight: [0, 160],
  crackbackRiskWeight: [0, 140],
};

const issueWeights: Record<string, number> = {
  all_in_no_defense_left: 0.025,
  combat_trick_outside_combat_window: 0.05,
  passed_with_non_mana_options: 0.02,
  risky_draw_near_deckout: 0.04,
  zero_score_non_mana_options: 0.02,
};

function clamp(value: number, [min, max]: [number, number]): number {
  return Math.max(min, Math.min(max, value));
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

function getWeightsForPlayer(
  playerId: PlayerId,
  candidatePlayerId: PlayerId,
  candidate: AiPolicyWeights,
  baseline: AiPolicyWeights,
): AiPolicyWeights {
  return playerId === candidatePlayerId ? candidate : baseline;
}

function increment(map: Record<string, number>, key: string, amount = 1): void {
  map[key] = (map[key] ?? 0) + amount;
}

function detectCombatIssues(game: GameState, playerId: PlayerId, plan: CombatPlan): string[] {
  const player = game.players.find((candidate) => candidate.playerId === playerId);
  const opponent = game.players.find((candidate) => candidate.playerId !== playerId);
  const opponentCreatureCount = opponent?.battlefield.filter((permanent) => permanent.card.cardTypes.includes("Creature")).length ?? 0;

  if (player && plan.attackerIds.length > 0 && plan.defenderIds.length === 0 && player.lifeTotal <= 10 && opponentCreatureCount > 0) {
    return ["all_in_no_defense_left"];
  }

  return [];
}

function scoreEvaluation(evaluation: Omit<AiTrainingEvaluation, "score" | "winrate" | "issuePenalty" | "avgTurns"> & { totalTurns: number }): AiTrainingEvaluation {
  const winrate = evaluation.games === 0 ? 0 : evaluation.wins / evaluation.games;
  const avgTurns = evaluation.games === 0 ? 0 : evaluation.totalTurns / evaluation.games;
  const issuePenalty = Object.entries(evaluation.issueCounts).reduce(
    (total, [issue, count]) => total + count * (issueWeights[issue] ?? 0.01),
    0,
  );
  const drawPenalty = evaluation.games === 0 ? 0 : (evaluation.draws / evaluation.games) * 0.08;

  return {
    games: evaluation.games,
    wins: evaluation.wins,
    losses: evaluation.losses,
    draws: evaluation.draws,
    winrate,
    avgTurns,
    issueCounts: evaluation.issueCounts,
    issuePenalty,
    score: winrate - issuePenalty - drawPenalty,
  };
}

function evaluateWeights(
  content: ContentBundle,
  weights: AiPolicyWeights,
  baselineWeights: AiPolicyWeights,
  seed: string,
  games: number,
  maxTurns: number,
): AiTrainingEvaluation {
  const archetypes = content.archetypes.map((archetype) => archetype.id);
  const random = createSeededRandom(seed);
  const issueCounts: Record<string, number> = {};
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let totalTurns = 0;

  for (let index = 0; index < games; index += 1) {
    const players = createPlayers(archetypes, random);
    const candidatePlayerId = index % 2 === 0 ? "player1" : "player2";
    const game = createInitialGame(content, {
      seed: `${seed}:game:${index}`,
      players,
    });

    const chooseAction = (currentGame: GameState, playerId: PlayerId, legalActions: LegalAction[]): LegalAction =>
      chooseActionWithPolicy(
        currentGame,
        playerId,
        legalActions,
        getWeightsForPlayer(playerId, candidatePlayerId, weights, baselineWeights),
      );

    const chooseCombatPlan = (currentGame: GameState, playerId: PlayerId): CombatPlan => {
      const plan = chooseCombatPlanWithPolicy(
        currentGame,
        playerId,
        getWeightsForPlayer(playerId, candidatePlayerId, weights, baselineWeights),
      );

      if (playerId === candidatePlayerId) {
        for (const issue of detectCombatIssues(currentGame, playerId, plan)) {
          increment(issueCounts, issue);
        }
      }

      return plan;
    };

    while (game.status !== "gameOver" && game.turnNumber < maxTurns) {
      playOneGeneralTurn(game, chooseAction, chooseCombatPlan);
    }

    totalTurns += game.turnNumber;

    if (game.winnerId === candidatePlayerId) {
      wins += 1;
    } else if (game.winnerId === null) {
      draws += 1;
    } else {
      losses += 1;
    }
  }

  return scoreEvaluation({
    games,
    wins,
    losses,
    draws,
    totalTurns,
    issueCounts,
  });
}

function mutateWeights(weights: AiPolicyWeights, random: () => number, mutationRate: number): AiPolicyWeights {
  const next = { ...weights };

  for (const key of Object.keys(next) as (keyof AiPolicyWeights)[]) {
    if (random() > 0.75) {
      continue;
    }

    const [min, max] = weightBounds[key];
    const span = max - min;
    const direction = random() < 0.5 ? -1 : 1;
    const magnitude = (0.15 + random() * 0.85) * mutationRate * span;
    next[key] = Number(clamp(next[key] + direction * magnitude, weightBounds[key]).toFixed(3));
  }

  return next;
}

function normalizeOptions(options: AiTrainingOptions): Required<AiTrainingOptions> {
  return {
    seed: options.seed ?? "ai-train",
    minutes: options.minutes ?? 15,
    gamesPerCandidate: options.gamesPerCandidate ?? 24,
    validationGamesPerCandidate: options.validationGamesPerCandidate ?? 0,
    validationMinScoreDelta: options.validationMinScoreDelta ?? 0,
    maxTurns: options.maxTurns ?? 40,
    mutationRate: options.mutationRate ?? 0.08,
    candidatesPerGeneration: options.candidatesPerGeneration ?? 6,
  };
}

function getCandidateSelectionScore(candidate: AiTrainingCandidate): number {
  return candidate.validationEvaluation?.score ?? candidate.evaluation.score;
}

export function trainAiPolicy(
  content: ContentBundle,
  options: AiTrainingOptions = {},
  onCandidate?: (candidate: AiTrainingCandidate, best: AiTrainingCandidate) => void,
): AiTrainingResult {
  const normalized = normalizeOptions(options);
  const started = Date.now();
  const deadline = started + normalized.minutes * 60_000;
  const random = createSeededRandom(normalized.seed);
  const history: AiTrainingCandidate[] = [];
  const baselineEvaluation = evaluateWeights(
    content,
    defaultAiPolicyWeights,
    defaultAiPolicyWeights,
    `${normalized.seed}:baseline`,
    normalized.gamesPerCandidate,
    normalized.maxTurns,
  );
  const baselineValidationEvaluation = normalized.validationGamesPerCandidate > 0
    ? evaluateWeights(
        content,
        defaultAiPolicyWeights,
        defaultAiPolicyWeights,
        `${normalized.seed}:validation:baseline`,
        normalized.validationGamesPerCandidate,
        normalized.maxTurns,
      )
    : undefined;
  const baseline: AiTrainingCandidate = {
    generation: 0,
    candidateIndex: 0,
    weights: defaultAiPolicyWeights,
    evaluation: baselineEvaluation,
    validationEvaluation: baselineValidationEvaluation,
  };
  let best = baseline;
  let generations = 0;
  let evaluatedCandidates = 1;

  history.push(baseline);
  onCandidate?.(baseline, best);

  while (Date.now() < deadline) {
    generations += 1;

    for (let candidateIndex = 0; candidateIndex < normalized.candidatesPerGeneration; candidateIndex += 1) {
      if (Date.now() >= deadline) {
        break;
      }

      const candidateWeights = mutateWeights(best.weights, random, normalized.mutationRate);
      const evaluation = evaluateWeights(
        content,
        candidateWeights,
        defaultAiPolicyWeights,
        `${normalized.seed}:gen:${generations}:candidate:${candidateIndex}`,
        normalized.gamesPerCandidate,
        normalized.maxTurns,
      );
      const validationEvaluation = normalized.validationGamesPerCandidate > 0
        ? evaluateWeights(
            content,
            candidateWeights,
            defaultAiPolicyWeights,
            `${normalized.seed}:validation:gen:${generations}:candidate:${candidateIndex}`,
            normalized.validationGamesPerCandidate,
            normalized.maxTurns,
          )
        : undefined;
      const candidate: AiTrainingCandidate = {
        generation: generations,
        candidateIndex,
        weights: candidateWeights,
        evaluation,
        validationEvaluation,
      };

      evaluatedCandidates += 1;
      history.push(candidate);

      if (getCandidateSelectionScore(candidate) > getCandidateSelectionScore(best) + normalized.validationMinScoreDelta) {
        best = candidate;
      }

      onCandidate?.(candidate, best);
    }
  }

  return {
    seed: normalized.seed,
    elapsedMs: Date.now() - started,
    generations,
    evaluatedCandidates,
    baseline,
    best,
    history,
    options: normalized,
  };
}
