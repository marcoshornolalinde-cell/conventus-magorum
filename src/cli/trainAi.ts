import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { trainAiPolicy, type AiTrainingCandidate } from "../ai/train.js";
import { loadContentBundle } from "../data/loadContent.js";

function readNumberArg(args: string[], name: string, fallback: number): number {
  const arg = args.find((candidate) => candidate.startsWith(`--${name}=`));

  if (!arg) {
    return fallback;
  }

  const value = Number.parseFloat(arg.slice(name.length + 3));
  return Number.isFinite(value) ? value : fallback;
}

function readStringArg(args: string[], name: string, fallback: string): string {
  const arg = args.find((candidate) => candidate.startsWith(`--${name}=`));
  return arg?.slice(name.length + 3) || fallback;
}

function formatCandidate(candidate: AiTrainingCandidate): string {
  const validation = candidate.validationEvaluation
    ? ` val=${candidate.validationEvaluation.score.toFixed(4)} valWr=${(candidate.validationEvaluation.winrate * 100).toFixed(1)}%`
    : "";

  return [
    `g=${candidate.generation}`,
    `i=${candidate.candidateIndex}`,
    `score=${candidate.evaluation.score.toFixed(4)}`,
    `wr=${(candidate.evaluation.winrate * 100).toFixed(1)}%`,
    `w=${candidate.evaluation.wins}`,
    `l=${candidate.evaluation.losses}`,
    `d=${candidate.evaluation.draws}`,
    `issues=${candidate.evaluation.issuePenalty.toFixed(3)}${validation}`,
  ].join(" ");
}

const args = process.argv.slice(2);
const minutes = readNumberArg(args, "minutes", 15);
const gamesPerCandidate = readNumberArg(args, "gamesPerCandidate", 24);
const validationGamesPerCandidate = readNumberArg(args, "validationGamesPerCandidate", 0);
const validationMinScoreDelta = readNumberArg(args, "validationMinScoreDelta", 0);
const candidatesPerGeneration = readNumberArg(args, "candidatesPerGeneration", 6);
const maxTurns = readNumberArg(args, "maxTurns", 40);
const mutationRate = readNumberArg(args, "mutationRate", 0.08);
const seed = readStringArg(args, "seed", "ai-train");
const output = readStringArg(args, "output", "models/ai-policy-latest.json");
const historyOutput = readStringArg(args, "history", "models/ai-policy-training-history.jsonl");
const json = args.includes("--json");
const started = new Date().toISOString();
let lastLoggedAt = 0;

mkdirSync(dirname(output), { recursive: true });
mkdirSync(dirname(historyOutput), { recursive: true });
writeFileSync(historyOutput, "", "utf8");

const result = trainAiPolicy(
  loadContentBundle(),
  {
    seed,
    minutes,
    gamesPerCandidate,
    validationGamesPerCandidate,
    validationMinScoreDelta,
    candidatesPerGeneration,
    maxTurns,
    mutationRate,
  },
  (candidate, best) => {
    writeFileSync(historyOutput, `${JSON.stringify(candidate)}\n`, { encoding: "utf8", flag: "a" });

    if (json) {
      return;
    }

    const now = Date.now();
    if (candidate.generation === 0 || now - lastLoggedAt > 10_000 || candidate === best) {
      console.log(`${formatCandidate(candidate)} | best ${formatCandidate(best)}`);
      lastLoggedAt = now;
    }
  },
);

const savedModel = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  startedAt: started,
  kind: "heuristic-policy-weights",
  seed: result.seed,
  options: result.options,
  baseline: result.baseline.evaluation,
  best: result.best,
};

writeFileSync(output, `${JSON.stringify(savedModel, null, 2)}\n`, "utf8");

if (json) {
  console.log(JSON.stringify({ ...result, output, historyOutput }, null, 2));
} else {
  console.log("");
  console.log("Training complete");
  console.log(`Elapsed: ${(result.elapsedMs / 1000).toFixed(1)}s`);
  console.log(`Evaluated candidates: ${result.evaluatedCandidates}`);
  console.log(`Baseline: ${formatCandidate(result.baseline)}`);
  console.log(`Best: ${formatCandidate(result.best)}`);
  console.log(`Model: ${output}`);
  console.log(`History: ${historyOutput}`);
}
