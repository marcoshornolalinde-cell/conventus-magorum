import { loadContentBundle } from "../data/loadContent.js";
import { runSelfplay, SelfplayRuntimeError } from "../selfplay/runMatch.js";

function readSeedFromArgs(args: string[]): string {
  const seedArg = args.find((arg) => arg.startsWith("--seed="));
  return seedArg?.slice("--seed=".length) || "selfplay-seed";
}

function readMaxTurnsFromArgs(args: string[]): number {
  const maxTurnsArg = args.find((arg) => arg.startsWith("--maxTurns="));
  return maxTurnsArg ? Number.parseInt(maxTurnsArg.slice("--maxTurns=".length), 10) : 30;
}

const args = process.argv.slice(2);
const seed = readSeedFromArgs(args);
const maxTurns = readMaxTurnsFromArgs(args);
const content = loadContentBundle();
let result;

try {
  result = runSelfplay(content, { seed, maxTurns });
} catch (error) {
  if (error instanceof SelfplayRuntimeError) {
    console.error(error.message);
    console.error(JSON.stringify(error.diagnostic, null, 2));
    process.exitCode = 1;
    process.exit();
  }

  throw error;
}
const { game } = result;

console.log(`Selfplay match`);
console.log(`Seed: ${game.seed}`);
console.log(`Game: ${game.id}`);
console.log(`Status: ${game.status}`);
console.log(`Phase: ${game.phase}`);
console.log(`Turn: ${game.turnNumber}`);
console.log(`Attacking priority: ${game.attackingPriorityPlayerId}`);
console.log(`Winner: ${game.winnerId ?? "none"}`);
console.log(`Reached turn limit: ${result.reachedTurnLimit}`);

for (const player of game.players) {
  const lands = player.battlefield.filter((instance) => instance.card.isLand);
  const creatures = player.battlefield.filter((instance) => instance.card.cardTypes.includes("Creature"));
  const others = player.battlefield.filter((instance) => !instance.card.isLand && !instance.card.cardTypes.includes("Creature"));

  console.log("");
  console.log(`${player.playerId}`);
  console.log(`Archetypes: ${player.archetypeIds.join(" + ")}`);
  console.log(`Life: ${player.lifeTotal}`);
  console.log(`Spell deck: ${player.spellDeck.length}`);
  console.log(`Land deck: ${player.landDeck.length}`);
  console.log(`Lands: ${lands.length}`);
  console.log(`Creatures: ${creatures.map((instance) => instance.card.name).join(", ") || "(empty)"}`);
  console.log(`Other permanents: ${others.map((instance) => instance.card.name).join(", ") || "(empty)"}`);
  console.log(`Graveyard: ${player.graveyard.map((instance) => instance.card.name).join(", ") || "(empty)"}`);
  console.log(`Hand: ${player.hand.map((instance) => instance.card.name).join(", ")}`);
}

console.log("");
console.log("Recent log:");
for (const entry of game.log.slice(-16)) {
  console.log(`[T${entry.turn} ${entry.phase}] ${entry.message}`);
}
