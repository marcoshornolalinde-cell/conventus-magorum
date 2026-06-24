import { auditUnsupportedMechanics } from "../data/auditUnsupportedMechanics.js";
import { loadContentBundle } from "../data/loadContent.js";

const audit = auditUnsupportedMechanics(loadContentBundle());

console.log(`Mechanics audit`);
console.log(`Cards with rules text: ${audit.cardsWithText}/${audit.totalCards}`);
console.log(`Unsupported or partially supported cards: ${audit.unsupportedCards.length}`);
console.log("");
console.log("Unsupported mechanic counts:");

for (const [label, count] of Object.entries(audit.unsupportedCounts).sort((first, second) => second[1] - first[1])) {
  console.log(`- ${label}: ${count}`);
}

console.log("");
console.log("Cards:");
for (const finding of audit.unsupportedCards) {
  console.log(`- ${finding.cardId} (${finding.cardName}): ${finding.unsupported.join(", ")}`);
}
