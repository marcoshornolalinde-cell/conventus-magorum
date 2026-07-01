import { auditAiGames } from "../ai/audit.js";
import { loadAiPolicyModel } from "../ai/model.js";
import { loadContentBundle } from "../data/loadContent.js";

function readNumberArg(args: string[], name: string, fallback: number): number {
  const arg = args.find((candidate) => candidate.startsWith(`--${name}=`));

  if (!arg) {
    return fallback;
  }

  const value = Number.parseInt(arg.slice(name.length + 3), 10);
  return Number.isFinite(value) ? value : fallback;
}

function readStringArg(args: string[], name: string, fallback: string): string {
  const arg = args.find((candidate) => candidate.startsWith(`--${name}=`));
  return arg?.slice(name.length + 3) || fallback;
}

function formatIssueCounts(issueCounts: Record<string, number>): string[] {
  return Object.entries(issueCounts)
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
    .map(([issue, count]) => `${issue}: ${count}`);
}

const args = process.argv.slice(2);
const games = readNumberArg(args, "games", 10);
const maxTurns = readNumberArg(args, "maxTurns", 40);
const sampleLimit = readNumberArg(args, "sampleLimit", 300);
const seed = readStringArg(args, "seed", "ai-review");
const modelPath = readStringArg(args, "model", "");
const model = modelPath ? loadAiPolicyModel(modelPath) : null;
const json = args.includes("--json");
const report = auditAiGames(loadContentBundle(), { games, maxTurns, sampleLimit, seed, weights: model?.weights });

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("AI audit");
  console.log(`Seed: ${report.seed}`);
  console.log(`AI model: ${model?.sourcePath ?? "base"}`);
  console.log(`Games: ${report.completedGames}/${report.games}`);
  console.log(`Game overs: ${report.gameOvers}`);
  console.log(`Max turns: ${report.maxTurns}`);

  if (report.errors.length > 0) {
    console.log(`Errors: ${report.errors.length}`);
    for (const error of report.errors.slice(0, 5)) {
      console.log(`- ${error}`);
    }
  }

  console.log("");
  console.log("Issue counts");
  for (const line of formatIssueCounts(report.issueCounts)) {
    console.log(`- ${line}`);
  }

  console.log("");
  console.log("Action counts");
  for (const [action, count] of Object.entries(report.actionCounts).sort((first, second) => second[1] - first[1])) {
    console.log(`- ${action}: ${count}`);
  }

  console.log("");
  console.log("Spell/ability tags");
  for (const [tag, count] of Object.entries(report.spellTagCounts).sort((first, second) => second[1] - first[1]).slice(0, 20)) {
    console.log(`- ${tag}: ${count}`);
  }

  console.log("");
  console.log("Tunable parameters");
  for (const parameter of report.tunableParameters) {
    console.log(`- ${parameter}`);
  }

  console.log("");
  console.log("Examples");
  for (const sample of report.samples.filter((entry) => entry.issueTags.length > 0).slice(0, 10)) {
    const chosenName = sample.chosen.cardName ?? sample.chosen.abilityId ?? sample.chosen.actionType;
    const top = sample.topOptions
      .slice(0, 3)
      .map((option) => `${option.cardName ?? option.abilityId ?? option.actionType} (${option.score.toFixed(1)})`)
      .join(", ");
    console.log(
      `- G${sample.gameIndex} T${sample.turn} ${sample.phase} ${sample.playerId}: ${sample.issueTags.join(", ")}; chose ${chosenName}; top: ${top || "none"}`,
    );
  }
}
