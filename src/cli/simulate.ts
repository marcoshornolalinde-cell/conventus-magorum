import { writeFileSync } from "node:fs";

import { loadContentBundle } from "../data/loadContent.js";
import { runSimulation } from "../simulate/runSimulation.js";

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

function formatPct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

const args = process.argv.slice(2);
const games = readNumberArg(args, "games", 1000);
const maxTurns = readNumberArg(args, "maxTurns", 40);
const seed = readStringArg(args, "seed", "simulation-seed");
const json = args.includes("--json");
const result = runSimulation(loadContentBundle(), { games, maxTurns, seed });

if (result.errors.length > 0) {
  const errorPath = `simulation-errors-${seed.replace(/[^a-z0-9_-]/gi, "_")}.json`;
  writeFileSync(errorPath, `${JSON.stringify(result.errors, null, 2)}\n`, "utf8");
  process.exitCode = 1;
}

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`Simulation`);
  console.log(`Seed: ${seed}`);
  console.log(`Games: ${result.completedGames}/${result.games}`);
  console.log(`Game overs: ${result.gameOvers}`);
  console.log(`Average turns: ${result.avgTurns.toFixed(2)}`);
  console.log(`Average time: ${result.avgMsPerGame.toFixed(3)}ms/game`);

  if (result.errors.length > 0) {
    console.log(`Errors: ${result.errors.length} (written to simulation-errors-${seed.replace(/[^a-z0-9_-]/gi, "_")}.json)`);
  }

  console.log("");
  console.log("Archetype | Played | Wins | Winrate");
  console.log("--- | ---: | ---: | ---:");

  for (const row of result.stats) {
    console.log(`${row.archetype} | ${row.played} | ${row.wins} | ${formatPct(row.winrate)}`);
  }
}
