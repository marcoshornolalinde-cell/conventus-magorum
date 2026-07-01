import { getPlayer } from "../core/actions.js";
import { canAttack, canBlock, canDefend, getCreatureStats, getCreaturesOnBattlefield, hasKeyword } from "../core/combat.js";
import { getEffectiveManaCost } from "../core/costs.js";
import { getSpellProfile } from "../core/spells.js";
import type { Card, CardInstance, CombatPlan, GameState, LegalAction, PlayerId, PlayerState } from "../core/types.js";
import { analyzeAiStrategy, type AiDeckStrategyKind, type AiStrategicPosture, type AiStrategyProfile } from "./strategy.js";

export interface AiPolicyWeights {
  spellPlayWeight: number;
  creaturePlayWeight: number;
  manaEfficiencyWeight: number;
  handPressureWeight: number;
  removalTargetThreatWeight: number;
  removalSaveForBiggerThreatWeight: number;
  combatTrickHoldWeight: number;
  combatTrickLethalWeight: number;
  combatTrickSaveCreatureWeight: number;
  attackLifePressureWeight: number;
  attackTradeValueWeight: number;
  attackRiskWeight: number;
  leaveBlockerWeight: number;
  evasionAttackWeight: number;
  lifelinkAttackWeight: number;
  trampleAttackWeight: number;
  deathtouchBlockWeight: number;
  firstStrikeTradeWeight: number;
  activatedDrawWeight: number;
  activatedDrawDeckoutPenalty: number;
  graveyardRecursionWeight: number;
  tokenCreationWeight: number;
  pumpTargetQualityWeight: number;
  auraEquipmentTimingWeight: number;
  instantSpeedPatienceWeight: number;
  lethalDetectionWeight: number;
  survivalDetectionWeight: number;
  strategyAggroCreatureDeploymentWeight: number;
  strategyAggroAttackWeight: number;
  strategyControlInteractionWeight: number;
  strategyControlThreatPatienceWeight: number;
  strategyControlResourceWeight: number;
  strategyTempoAccelerationWeight: number;
  strategyTempoThreatDeploymentWeight: number;
  strategyRaceAttackWeight: number;
  strategyStabilizeBlockerWeight: number;
  strategyResourceDevelopmentWeight: number;
}

export const defaultAiPolicyWeights: AiPolicyWeights = {
  spellPlayWeight: 8,
  creaturePlayWeight: 42,
  manaEfficiencyWeight: 5,
  handPressureWeight: 2,
  removalTargetThreatWeight: 68,
  removalSaveForBiggerThreatWeight: 8,
  combatTrickHoldWeight: 18,
  combatTrickLethalWeight: 45,
  combatTrickSaveCreatureWeight: 25,
  attackLifePressureWeight: 10,
  attackTradeValueWeight: 7,
  attackRiskWeight: 16,
  leaveBlockerWeight: 12,
  evasionAttackWeight: 18,
  lifelinkAttackWeight: 9,
  trampleAttackWeight: 8,
  deathtouchBlockWeight: 14,
  firstStrikeTradeWeight: 8,
  activatedDrawWeight: 45,
  activatedDrawDeckoutPenalty: 30,
  graveyardRecursionWeight: 34,
  tokenCreationWeight: 38,
  pumpTargetQualityWeight: 11,
  auraEquipmentTimingWeight: 32,
  instantSpeedPatienceWeight: 20,
  lethalDetectionWeight: 100,
  survivalDetectionWeight: 60,
  strategyAggroCreatureDeploymentWeight: 26,
  strategyAggroAttackWeight: 18,
  strategyControlInteractionWeight: 24,
  strategyControlThreatPatienceWeight: 18,
  strategyControlResourceWeight: 22,
  strategyTempoAccelerationWeight: 28,
  strategyTempoThreatDeploymentWeight: 24,
  strategyRaceAttackWeight: 22,
  strategyStabilizeBlockerWeight: 20,
  strategyResourceDevelopmentWeight: 18,
};

export type AiSpellIntentTag =
  | "removal"
  | "damageRemoval"
  | "bounce"
  | "counter"
  | "pump"
  | "teamPump"
  | "combatTrick"
  | "protection"
  | "cardDraw"
  | "cardSelection"
  | "lifeGain"
  | "tokens"
  | "recursion"
  | "persistentAttachment"
  | "counters"
  | "manaDevelopment";

export interface AiDecisionFeatures {
  actionType: LegalAction["type"];
  cardId?: string;
  cardName?: string;
  abilityId?: string;
  score: number;
  tags: string[];
  targetThreat: number;
  ownTargetQuality: number;
  phase: GameState["phase"];
  ownLife: number;
  opponentLife: number;
  ownHandSize: number;
  opponentBattlefieldCreatures: number;
  ownBattlefieldCreatures: number;
  strategyKind: AiDeckStrategyKind;
  strategicPosture: AiStrategicPosture;
  strategicConfidence: number;
  strategyEnabled: boolean;
  raceScore: number;
  resourceNeed: number;
}

interface ScoredAction {
  action: LegalAction;
  features: AiDecisionFeatures;
}

function findPermanentController(game: GameState, instanceId: string): PlayerState | null {
  return game.players.find((player) => player.battlefield.some((permanent) => permanent.instanceId === instanceId)) ?? null;
}

function findPermanent(game: GameState, instanceId: string): CardInstance | null {
  return findPermanentController(game, instanceId)?.battlefield.find((permanent) => permanent.instanceId === instanceId) ?? null;
}

function findGraveyardCard(game: GameState, instanceId: string): CardInstance | null {
  return game.players.flatMap((player) => player.graveyard).find((card) => card.instanceId === instanceId) ?? null;
}

function getOpponent(game: GameState, playerId: PlayerId): PlayerState {
  const opponent = game.players.find((player) => player.playerId !== playerId);

  if (!opponent) {
    throw new Error(`Player ${playerId} has no opponent.`);
  }

  return opponent;
}

function isOwnPermanent(game: GameState, playerId: PlayerId, instanceId: string): boolean {
  return findPermanentController(game, instanceId)?.playerId === playerId;
}

function getHandCard(player: PlayerState, cardInstanceId: string): CardInstance | null {
  return player.hand.find((card) => card.instanceId === cardInstanceId) ?? null;
}

function hasSubtype(instance: CardInstance, subtype: string): boolean {
  return new RegExp(`\\b${subtype}\\b`, "i").test(instance.card.typeLine) || (instance.additionalSubtypes ?? []).includes(subtype);
}

function isEvasive(instance: CardInstance): boolean {
  return hasKeyword(instance, "Flying") || hasKeyword(instance, "Menace") || hasKeyword(instance, "Unblockable");
}

function getCreatureQuality(instance: CardInstance): number {
  if (!instance.card.cardTypes.includes("Creature")) {
    return instance.card.manaValue;
  }

  const stats = getCreatureStats(instance);
  let quality = stats.power * 2 + stats.toughness + instance.plusOneCounters * 2 + instance.card.manaValue;

  if (isEvasive(instance)) quality += 4;
  if (hasKeyword(instance, "First strike") || hasKeyword(instance, "Double strike")) quality += 3;
  if (hasKeyword(instance, "Deathtouch")) quality += 4;
  if (hasKeyword(instance, "Lifelink")) quality += 3;
  if (hasKeyword(instance, "Trample")) quality += 2;

  return quality;
}

function targetThreat(game: GameState, playerId: PlayerId, targetIds: string[]): number {
  return targetIds.reduce((highest, targetId) => {
    const target = findPermanent(game, targetId);

    if (!target || isOwnPermanent(game, playerId, targetId)) {
      return highest;
    }

    return Math.max(highest, getCreatureQuality(target));
  }, 0);
}

function ownTargetQuality(game: GameState, playerId: PlayerId, targetIds: string[]): number {
  return targetIds.reduce((total, targetId) => {
    const target = findPermanent(game, targetId) ?? findGraveyardCard(game, targetId);

    if (!target) {
      return total;
    }

    const isOurs = target.ownerId === playerId || isOwnPermanent(game, playerId, targetId);
    return isOurs ? total + getCreatureQuality(target) : total;
  }, 0);
}

function hasAnyEffect(card: Card, effectTypes: string[]): boolean {
  const profile = getSpellProfile(card);
  return profile?.effects.some((effect) => effectTypes.includes(effect.type)) ?? false;
}

function hasKnownCombatPairings(game: GameState): boolean {
  return game.currentCombatPairings.length > 0;
}

function getBaseFeatures(
  game: GameState,
  playerId: PlayerId,
  actionType: LegalAction["type"],
  score: number,
  tags: string[],
  strategy: AiStrategyProfile,
  targetThreatValue = 0,
  ownTargetQualityValue = 0,
): Omit<AiDecisionFeatures, "cardId" | "cardName" | "abilityId"> {
  const player = getPlayer(game, playerId);
  const opponent = getOpponent(game, playerId);

  return {
    actionType,
    score,
    tags,
    targetThreat: targetThreatValue,
    ownTargetQuality: ownTargetQualityValue,
    phase: game.phase,
    ownLife: player.lifeTotal,
    opponentLife: opponent.lifeTotal,
    ownHandSize: player.hand.length,
    ownBattlefieldCreatures: getCreaturesOnBattlefield(player).length,
    opponentBattlefieldCreatures: getCreaturesOnBattlefield(opponent).length,
    strategyKind: strategy.deckKind,
    strategicPosture: strategy.posture,
    strategicConfidence: strategy.strategicConfidence,
    strategyEnabled: strategy.strategyEnabled,
    raceScore: strategy.raceScore,
    resourceNeed: strategy.resourceNeed,
  };
}

function getStrategyScale(strategy: AiStrategyProfile): number {
  return strategy.strategyEnabled ? strategy.strategicConfidence : 0;
}

function scoreStrategicSpellModifier(
  tags: string[],
  strategy: AiStrategyProfile,
  weights: AiPolicyWeights,
): number {
  let score = 0;
  const scale = getStrategyScale(strategy);

  if (scale <= 0) {
    return 0;
  }

  const isInteraction = tags.some((tag) => ["removal", "damageRemoval", "bounce", "counter"].includes(tag));
  const isResource = tags.some((tag) => ["cardDraw", "cardSelection", "recursion"].includes(tag));
  const isPressure = tags.some((tag) => ["tokens", "teamPump", "combatTrick", "pump", "counters"].includes(tag));

  if (strategy.deckKind === "aggro" && isPressure) score += weights.strategyAggroCreatureDeploymentWeight * 0.55;
  if (strategy.deckKind === "control" && isInteraction) score += weights.strategyControlInteractionWeight;
  if (strategy.deckKind === "control" && isResource && strategy.boardControlled) score += weights.strategyControlResourceWeight;
  if (strategy.deckKind === "tempo" && tags.includes("manaDevelopment")) score += weights.strategyTempoAccelerationWeight;
  if (strategy.deckKind === "tempo" && (isInteraction || isPressure)) score += weights.strategyTempoThreatDeploymentWeight * 0.45;

  if (strategy.posture === "race" && isPressure) score += weights.strategyRaceAttackWeight;
  if (strategy.posture === "stabilize" && (isInteraction || tags.includes("lifeGain") || tags.includes("protection"))) {
    score += weights.strategyStabilizeBlockerWeight;
  }
  if ((strategy.posture === "resource" || strategy.posture === "develop") && (isResource || tags.includes("manaDevelopment"))) {
    score += weights.strategyResourceDevelopmentWeight;
  }

  return score * scale;
}

interface VirtualCombatant {
  instanceId: string;
  controllerId: PlayerId;
  power: number;
  toughness: number;
  damageMarked: number;
  deathtouchDamageMarked: number;
  keywords: Set<string>;
  removed: boolean;
}

function findPermanentOwner(game: GameState, instanceId: string): PlayerId | null {
  return findPermanentController(game, instanceId)?.playerId ?? null;
}

function createVirtualCombatant(game: GameState, instance: CardInstance): VirtualCombatant {
  const stats = getCreatureStats(instance);

  return {
    instanceId: instance.instanceId,
    controllerId: findPermanentOwner(game, instance.instanceId) ?? instance.ownerId,
    power: stats.power,
    toughness: stats.toughness,
    damageMarked: instance.damageMarked,
    deathtouchDamageMarked: instance.deathtouchDamageMarked,
    keywords: new Set([...instance.card.keywords, ...instance.staticKeywords, ...instance.temporaryKeywords].map((keyword) => keyword.toLowerCase())),
    removed: false,
  };
}

function virtualHasKeyword(creature: VirtualCombatant, keyword: string): boolean {
  return creature.keywords.has(keyword.toLowerCase());
}

function addVirtualKeywords(creature: VirtualCombatant | undefined, keywords: string[]): void {
  for (const keyword of keywords) {
    creature?.keywords.add(keyword.toLowerCase());
  }
}

function getCombatVirtuals(game: GameState): Map<string, VirtualCombatant> {
  const virtuals = new Map<string, VirtualCombatant>();

  for (const pairing of game.currentCombatPairings) {
    const ids = [pairing.attackerId, ...pairing.defenderIds];

    for (const id of ids) {
      const permanent = findPermanent(game, id);

      if (permanent && !virtuals.has(id)) {
        virtuals.set(id, createVirtualCombatant(game, permanent));
      }
    }
  }

  return virtuals;
}

function wouldBeDead(creature: VirtualCombatant): boolean {
  return creature.removed || creature.toughness <= 0 || creature.damageMarked >= creature.toughness || creature.deathtouchDamageMarked > 0;
}

function assignVirtualAttackerDamage(attacker: VirtualCombatant, blockers: VirtualCombatant[]): { killedBlockers: Set<string>; trampleDamage: number } {
  const killedBlockers = new Set<string>();
  let remainingPower = Math.max(0, attacker.power);

  for (const blocker of blockers) {
    if (remainingPower <= 0 || wouldBeDead(blocker)) {
      continue;
    }

    const lethalDamage = virtualHasKeyword(attacker, "Deathtouch")
      ? 1
      : Math.max(0, blocker.toughness - blocker.damageMarked);
    const assigned = Math.min(remainingPower, lethalDamage || remainingPower);

    if (assigned > 0 && (virtualHasKeyword(attacker, "Deathtouch") || blocker.damageMarked + assigned >= blocker.toughness)) {
      killedBlockers.add(blocker.instanceId);
    }

    remainingPower -= assigned;
  }

  return {
    killedBlockers,
    trampleDamage: virtualHasKeyword(attacker, "Trample") ? Math.max(0, remainingPower) : 0,
  };
}

function blockerKillsAttacker(attacker: VirtualCombatant, blockers: VirtualCombatant[]): boolean {
  const liveBlockers = blockers.filter((blocker) => !wouldBeDead(blocker));

  return (
    liveBlockers.some((blocker) => virtualHasKeyword(blocker, "Deathtouch") && blocker.power > 0) ||
    liveBlockers.reduce((total, blocker) => total + Math.max(0, blocker.power), 0) + attacker.damageMarked >= attacker.toughness
  );
}

function evaluatePairingForPlayer(
  game: GameState,
  playerId: PlayerId,
  pairing: GameState["currentCombatPairings"][number],
  virtuals: Map<string, VirtualCombatant>,
): number {
  const attacker = virtuals.get(pairing.attackerId);

  if (!attacker || wouldBeDead(attacker)) {
    return 0;
  }

  const defendingPlayer = getPlayer(game, pairing.defendingPlayerId);
  const blockers = pairing.defenderIds
    .map((defenderId) => virtuals.get(defenderId))
    .filter((blocker): blocker is VirtualCombatant => blocker !== undefined && !wouldBeDead(blocker));
  const isOwnAttacker = attacker.controllerId === playerId;
  let utility = 0;

  if (blockers.length === 0) {
    const damageMultiplier = virtualHasKeyword(attacker, "Double strike") ? 2 : 1;
    const damage = Math.max(0, attacker.power) * damageMultiplier;
    utility += (isOwnAttacker ? 1 : -1) * damage * 4;
    if (damage >= defendingPlayer.lifeTotal) utility += isOwnAttacker ? 80 : -80;
    return utility;
  }

  const firstStrikeAttacker = virtualHasKeyword(attacker, "First strike") || virtualHasKeyword(attacker, "Double strike");
  const firstStrikeBlockers = blockers.some((blocker) => virtualHasKeyword(blocker, "First strike") || virtualHasKeyword(blocker, "Double strike"));
  const attackerDamage = assignVirtualAttackerDamage(attacker, blockers);
  let killedBlockers = attackerDamage.killedBlockers;
  let attackerDies = false;

  if (firstStrikeAttacker && !firstStrikeBlockers && killedBlockers.size === blockers.length) {
    attackerDies = false;
  } else {
    attackerDies = blockerKillsAttacker(attacker, blockers);
  }

  if (virtualHasKeyword(attacker, "Double strike") && !attackerDies) {
    const survivingBlockers = blockers.filter((blocker) => !killedBlockers.has(blocker.instanceId));
    const regularDamage = assignVirtualAttackerDamage(attacker, survivingBlockers);
    killedBlockers = new Set([...killedBlockers, ...regularDamage.killedBlockers]);
  }

  for (const blocker of blockers) {
    const blockerIsOurs = blocker.controllerId === playerId;
    if (killedBlockers.has(blocker.instanceId)) utility += blockerIsOurs ? -18 : 18;
    else utility += blockerIsOurs ? 5 : -5;
  }

  utility += attackerDies ? (isOwnAttacker ? -22 : 22) : (isOwnAttacker ? 7 : -7);
  utility += (isOwnAttacker ? 1 : -1) * attackerDamage.trampleDamage * 4;
  if (attackerDamage.trampleDamage >= defendingPlayer.lifeTotal) utility += isOwnAttacker ? 80 : -80;

  return utility;
}

function evaluateCurrentCombatForPlayer(game: GameState, playerId: PlayerId, virtuals: Map<string, VirtualCombatant>): number {
  return game.currentCombatPairings.reduce(
    (total, pairing) => total + evaluatePairingForPlayer(game, playerId, pairing, virtuals),
    0,
  );
}

function applySpellToVirtualCombat(
  game: GameState,
  playerId: PlayerId,
  action: Extract<LegalAction, { type: "castSpell" }>,
  virtuals: Map<string, VirtualCombatant>,
): boolean {
  const player = getPlayer(game, playerId);
  const card = getHandCard(player, action.cardInstanceId);
  const profile = card ? getSpellProfile(card.card) : null;

  if (!profile) {
    return false;
  }

  let affectedCombat = false;

  for (const effect of profile.effects) {
    if (effect.type === "modifyCreature") {
      for (const targetId of action.targetIds) {
        const target = virtuals.get(targetId);
        if (!target) continue;
        target.power += effect.power;
        target.toughness += effect.toughness;
        affectedCombat = true;
      }
    }

    if (effect.type === "modifyOwnCreatures") {
      for (const creature of virtuals.values()) {
        if (creature.controllerId !== playerId) continue;
        creature.power += effect.power;
        creature.toughness += effect.toughness;
        affectedCombat = true;
      }
    }

    if (effect.type === "grantKeywords") {
      for (const targetId of action.targetIds) {
        const target = virtuals.get(targetId);
        if (!target) continue;
        addVirtualKeywords(target, effect.keywords);
        affectedCombat = true;
      }
    }

    if (effect.type === "grantKeywordsToOwnCreatures") {
      for (const creature of virtuals.values()) {
        if (creature.controllerId !== playerId) continue;
        addVirtualKeywords(creature, effect.keywords);
        affectedCombat = true;
      }
    }

    if (["destroyCreature", "destroyPermanent", "exileCreature", "prayerBinding", "returnPermanentToHand"].includes(effect.type)) {
      for (const targetId of action.targetIds) {
        const target = virtuals.get(targetId);
        if (!target) continue;
        target.removed = true;
        affectedCombat = true;
      }
    }

    if (effect.type === "damageCreature") {
      for (const targetId of action.targetIds) {
        const target = virtuals.get(targetId);
        if (!target) continue;
        target.damageMarked += effect.amount;
        affectedCombat = true;
      }
    }

    if (effect.type === "grantReturnTappedWithCounterOnDeath") {
      affectedCombat = action.targetIds.some((targetId) => virtuals.has(targetId));
    }
  }

  return affectedCombat;
}

function applyActivatedAbilityToVirtualCombat(
  game: GameState,
  playerId: PlayerId,
  action: Extract<LegalAction, { type: "activateAbility" }>,
  virtuals: Map<string, VirtualCombatant>,
): boolean {
  let affectedCombat = false;
  const target = action.targetIds[0] ? virtuals.get(action.targetIds[0]) : undefined;

  if (/destroy/i.test(action.abilityId) && target && target.controllerId !== playerId) {
    target.removed = true;
    return true;
  }

  if (/attacking_pump/i.test(action.abilityId)) {
    const attackingIds = new Set(
      game.events
        .filter((event) => event.turn === game.turnNumber && event.type === "creatureAttacked" && event.playerId === playerId)
        .map((event) => event.sourceId)
        .filter((sourceId): sourceId is string => typeof sourceId === "string"),
    );
    const pumpAmount = attackingIds.size;

    for (const attackerId of attackingIds) {
      const attacker = virtuals.get(attackerId);
      if (!attacker) continue;
      attacker.power += pumpAmount;
      attacker.toughness += pumpAmount;
      affectedCombat = true;
    }
  }

  if (/attacking_counter/i.test(action.abilityId) && target && target.controllerId === playerId) {
    target.power += 1;
    target.toughness += 1;
    const permanent = findPermanent(game, target.instanceId);
    if (permanent && hasSubtype(permanent, "Cat")) {
      target.keywords.add("first strike");
    }
    affectedCombat = true;
  }

  if (/pump/i.test(action.abilityId) && target && target.controllerId === playerId) {
    target.power += 5;
    target.toughness += 5;
    target.keywords.add("trample");
    affectedCombat = true;
  }

  return affectedCombat;
}

function scoreCombatResolutionImpact(
  game: GameState,
  playerId: PlayerId,
  action: LegalAction,
): number {
  if (game.phase !== "combat" || game.currentCombatPairings.length === 0) {
    return 0;
  }

  const before = getCombatVirtuals(game);
  const after = new Map<string, VirtualCombatant>(
    [...before.entries()].map(([id, creature]) => [
      id,
      {
        ...creature,
        keywords: new Set(creature.keywords),
      },
    ]),
  );
  let affectedCombat = false;

  if (action.type === "castSpell") {
    affectedCombat = applySpellToVirtualCombat(game, playerId, action, after);
  } else if (action.type === "activateAbility") {
    affectedCombat = applyActivatedAbilityToVirtualCombat(game, playerId, action, after);
  }

  if (!affectedCombat) {
    return 0;
  }

  const beforeScore = evaluateCurrentCombatForPlayer(game, playerId, before);
  const afterScore = evaluateCurrentCombatForPlayer(game, playerId, after);
  return afterScore - beforeScore;
}

export function getSpellIntentTags(card: Card): AiSpellIntentTag[] {
  const profile = getSpellProfile(card);

  if (!profile) {
    return [];
  }

  const tags = new Set<AiSpellIntentTag>();
  const effectTypes = profile.effects.map((effect) => effect.type);

  if (effectTypes.some((type) => ["destroyCreature", "destroyPermanent", "exileCreature", "prayerBinding"].includes(type))) {
    tags.add("removal");
  }

  if (effectTypes.includes("damageCreature") || effectTypes.includes("ownCreatureDealsPowerDamage")) {
    tags.add("removal");
    tags.add("damageRemoval");
  }

  if (effectTypes.includes("returnPermanentToHand")) {
    tags.add("removal");
    tags.add("bounce");
  }

  if (effectTypes.includes("counterSpell")) tags.add("counter");
  for (const effect of profile.effects) {
    if (effect.type !== "modifyCreature") {
      continue;
    }

    if (effect.power < 0 || effect.toughness < 0) {
      tags.add("removal");
      tags.add("damageRemoval");
    } else {
      tags.add("pump");
    }
  }
  if (effectTypes.includes("modifyOwnCreatures")) tags.add("teamPump");
  if (effectTypes.includes("grantReturnTappedWithCounterOnDeath")) tags.add("protection");
  if (effectTypes.includes("drawCards") || effectTypes.includes("drawCardsIfAdditionalManaPaid") || effectTypes.includes("optionalDiscardThenDraw")) tags.add("cardDraw");
  if (effectTypes.includes("scry")) tags.add("cardSelection");
  if (effectTypes.includes("gainLife")) tags.add("lifeGain");
  if (effectTypes.includes("createToken")) tags.add("tokens");
  if (effectTypes.some((type) => ["returnGraveyardCreatureToHand", "destroyCreatureOrReturnZombieFromGraveyardToBattlefieldTapped"].includes(type))) tags.add("recursion");
  if (effectTypes.includes("attachPersistent")) tags.add("persistentAttachment");
  if (effectTypes.includes("addPlusOneCounters") || effectTypes.includes("distributeCountersThenDouble")) tags.add("counters");
  if (card.id === "new_horizons") tags.add("manaDevelopment");

  const grantsCombatKeyword = profile.effects.some(
    (effect) =>
      (effect.type === "grantKeywords" || effect.type === "grantKeywordsToOwnCreatures") &&
      effect.keywords.some((keyword) => ["First strike", "Deathtouch", "Indestructible", "Trample", "Lifelink"].includes(keyword)),
  );

  if (
    card.cardTypes.includes("Instant") &&
    (tags.has("pump") || tags.has("protection") || grantsCombatKeyword)
  ) {
    tags.add("combatTrick");
  }

  return [...tags];
}

function scoreSpellAction(
  game: GameState,
  playerId: PlayerId,
  action: Extract<LegalAction, { type: "castSpell" }>,
  weights: AiPolicyWeights,
): AiDecisionFeatures {
  const player = getPlayer(game, playerId);
  const opponent = getOpponent(game, playerId);
  const strategy = analyzeAiStrategy(game, playerId);
  const card = getHandCard(player, action.cardInstanceId);
  const tags = card ? getSpellIntentTags(card.card) : [];
  const threat = targetThreat(game, playerId, action.targetIds);
  const ownQuality = ownTargetQuality(game, playerId, action.targetIds);
  const combatImpact = scoreCombatResolutionImpact(game, playerId, action);
  let score = weights.spellPlayWeight;

  if (tags.includes("removal")) {
    score += weights.removalTargetThreatWeight + threat * 3;
    if (threat < 6) score -= weights.removalSaveForBiggerThreatWeight;
    if (game.phase === "combat" && combatImpact > 0) score += combatImpact;
  }

  if (tags.includes("counter")) {
    score += game.stack.length > 0 ? weights.removalTargetThreatWeight + weights.instantSpeedPatienceWeight : -30;
  }

  if (tags.includes("pump") || tags.includes("counters")) {
    score += weights.pumpTargetQualityWeight + ownQuality;
  }

  if (tags.includes("teamPump")) {
    const ownCreatureCount = getCreaturesOnBattlefield(player).length;
    score += weights.pumpTargetQualityWeight * ownCreatureCount;
    if (game.phase === "combat") score += weights.combatTrickLethalWeight;
  }

  if (tags.includes("combatTrick")) {
    const isCombat = game.phase === "combat";
    const pairingsKnown = hasKnownCombatPairings(game);
    const readyForCombatTrick = isCombat && pairingsKnown && combatImpact > 0;
    score += readyForCombatTrick
      ? weights.instantSpeedPatienceWeight + weights.combatTrickLethalWeight + combatImpact
      : -(weights.combatTrickHoldWeight * 4 + weights.combatTrickSaveCreatureWeight + weights.combatTrickLethalWeight);
    if (readyForCombatTrick && opponent.lifeTotal <= Math.max(1, ownQuality)) score += weights.lethalDetectionWeight;
  }

  if (tags.includes("protection")) {
    score += weights.combatTrickSaveCreatureWeight + ownQuality;
  }

  if (tags.includes("cardDraw") || tags.includes("cardSelection")) {
    score += weights.activatedDrawWeight;
    score += Math.max(0, 5 - player.hand.length) * weights.handPressureWeight;
    if (player.spellDeck.length <= 2) score -= weights.activatedDrawDeckoutPenalty;
  }

  if (tags.includes("tokens")) score += weights.tokenCreationWeight;
  if (tags.includes("recursion")) score += weights.graveyardRecursionWeight + ownQuality;
  if (tags.includes("persistentAttachment")) score += weights.auraEquipmentTimingWeight + ownQuality + threat;
  if (tags.includes("manaDevelopment")) score += Math.max(0, 6 - game.turnNumber) * weights.manaEfficiencyWeight;
  if (tags.includes("lifeGain") && player.lifeTotal <= 8) score += weights.survivalDetectionWeight;

  score += (card?.card.manaValue ?? 0) * weights.manaEfficiencyWeight;
  score -= action.additionalCosts.length * 4;
  score += scoreStrategicSpellModifier(tags, strategy, weights);

  return {
    ...getBaseFeatures(game, playerId, "castSpell", score, tags, strategy, threat, ownQuality),
    actionType: "castSpell",
    cardId: card?.card.id,
    cardName: card?.card.name,
  };
}

function scoreCreatureAction(
  game: GameState,
  playerId: PlayerId,
  action: Extract<LegalAction, { type: "playCreature" }>,
  weights: AiPolicyWeights,
): AiDecisionFeatures {
  const player = getPlayer(game, playerId);
  const opponent = getOpponent(game, playerId);
  const strategy = analyzeAiStrategy(game, playerId);
  const card = getHandCard(player, action.cardInstanceId);
  const stats = card ? getCreatureStats(card) : { power: 0, toughness: 0 };
  let score = weights.creaturePlayWeight + (card?.card.manaValue ?? 0) * weights.manaEfficiencyWeight;
  const tags: string[] = ["creature"];
  const strategyScale = getStrategyScale(strategy);

  score += stats.power * 2 + stats.toughness;

  if (card && isEvasive(card)) {
    score += weights.evasionAttackWeight;
    tags.push("evasion");
  }

  if (card && hasKeyword(card, "Lifelink")) {
    score += weights.lifelinkAttackWeight;
    tags.push("lifelink");
  }

  if (card && hasKeyword(card, "Trample")) {
    score += weights.trampleAttackWeight;
    tags.push("trample");
  }

  if (card && hasSubtype(card, "Wall")) {
    score -= weights.attackLifePressureWeight;
  }

  if (strategy.deckKind === "aggro" && card && card.card.manaValue <= 3 && !hasSubtype(card, "Wall")) {
    score += weights.strategyAggroCreatureDeploymentWeight * strategyScale;
    tags.push("strategyAggroCurve");
  }

  if (strategy.deckKind === "control" && strategy.posture !== "stabilize" && game.turnNumber < 6) {
    score -= weights.strategyControlThreatPatienceWeight * strategyScale;
    tags.push("strategyControlPatience");
  }

  if (strategy.deckKind === "tempo" && card && (card.card.manaValue >= 4 || stats.power >= 4 || isEvasive(card))) {
    score += weights.strategyTempoThreatDeploymentWeight * strategyScale;
    tags.push("strategyTempoThreat");
  }

  if (strategy.posture === "stabilize") {
    score += Math.max(0, stats.toughness - stats.power) * weights.strategyStabilizeBlockerWeight * 0.35 * strategyScale;
    tags.push("strategyStabilize");
  }

  if (strategy.posture === "develop") {
    score += weights.strategyResourceDevelopmentWeight * 0.4 * strategyScale;
    tags.push("strategyDevelop");
  }

  return {
    ...getBaseFeatures(game, playerId, "playCreature", score, tags, strategy),
    actionType: "playCreature",
    cardId: card?.card.id,
    cardName: card?.card.name,
  };
}

function hasAttackedThisTurn(game: GameState, playerId: PlayerId, instanceId: string): boolean {
  return game.events.some(
    (event) =>
      event.turn === game.turnNumber &&
      event.type === "creatureAttacked" &&
      event.playerId === playerId &&
      event.sourceId === instanceId,
  );
}

function countAttackersThisTurn(game: GameState, playerId: PlayerId): number {
  return game.events.filter(
    (event) => event.turn === game.turnNumber && event.type === "creatureAttacked" && event.playerId === playerId,
  ).length;
}

function scoreActivatedAction(
  game: GameState,
  playerId: PlayerId,
  action: Extract<LegalAction, { type: "activateAbility" }>,
  weights: AiPolicyWeights,
): AiDecisionFeatures {
  const player = getPlayer(game, playerId);
  const opponent = getOpponent(game, playerId);
  const strategy = analyzeAiStrategy(game, playerId);
  const abilityId = action.abilityId;
  const targetId = action.targetIds[0];
  const target = targetId ? findPermanent(game, targetId) : null;
  const targetIsOurs = targetId ? isOwnPermanent(game, playerId, targetId) : false;
  const targetIsAttacking = targetId ? hasAttackedThisTurn(game, playerId, targetId) : false;
  const attackerCount = countAttackersThisTurn(game, playerId);
  const threat = targetThreat(game, playerId, action.targetIds);
  const ownQuality = ownTargetQuality(game, playerId, action.targetIds);
  const combatImpact = scoreCombatResolutionImpact(game, playerId, action);
  const tags: string[] = ["activated"];
  const strategyScale = getStrategyScale(strategy);
  let score = 0;

  if (/destroy/i.test(abilityId)) {
    score = targetId && !targetIsOurs ? weights.removalTargetThreatWeight + threat * 3 : -30;
    tags.push("removal");
  } else if (/attacking_pump/i.test(abilityId)) {
    score = attackerCount > 0 ? weights.pumpTargetQualityWeight * attackerCount + weights.combatTrickLethalWeight : 0;
    tags.push("combatTrick", "pump");
  } else if (/attacking_counter/i.test(abilityId)) {
    score = targetIsOurs && targetIsAttacking ? weights.combatTrickLethalWeight + ownQuality : weights.pumpTargetQualityWeight;
    tags.push("combatTrick", "counters");
  } else if (/unblockable|flying_sacrifice/i.test(abilityId)) {
    score = target && targetIsOurs && canAttack(target, game.turnNumber) ? weights.evasionAttackWeight + ownQuality : 20;
    tags.push("evasion");
  } else if (/pump/i.test(abilityId)) {
    score = targetIsOurs ? weights.pumpTargetQualityWeight + ownQuality : -20;
    if (targetIsAttacking) score += weights.combatTrickLethalWeight;
    tags.push("pump");
  } else if (/draw/i.test(abilityId)) {
    score = weights.activatedDrawWeight - (player.spellDeck.length <= 2 ? weights.activatedDrawDeckoutPenalty : 0);
    tags.push("cardDraw");
  } else if (/drain/i.test(abilityId)) {
    score = weights.attackLifePressureWeight + weights.spellPlayWeight;
    tags.push("lifeDrain");
  } else if (/transform|sacrifice_counter|return_tapped|create_zombies/i.test(abilityId)) {
    score = weights.graveyardRecursionWeight;
    tags.push("boardDevelopment");
  }

  if (tags.includes("removal") && strategy.deckKind === "control") score += weights.strategyControlInteractionWeight * strategyScale;
  if (tags.includes("cardDraw") && (strategy.deckKind === "control" || strategy.posture === "resource")) score += weights.strategyControlResourceWeight * strategyScale;
  if ((tags.includes("boardDevelopment") || tags.includes("pump")) && strategy.deckKind === "tempo") score += weights.strategyTempoThreatDeploymentWeight * 0.5 * strategyScale;
  if (strategy.posture === "race" && (tags.includes("pump") || tags.includes("lifeDrain") || tags.includes("evasion"))) score += weights.strategyRaceAttackWeight * strategyScale;
  if (strategy.posture === "stabilize" && tags.includes("removal")) score += weights.strategyStabilizeBlockerWeight * strategyScale;
  if (/attacking_(pump|counter)/i.test(abilityId) && attackerCount === 0) score = -40;
  if (game.phase === "combat" && tags.includes("combatTrick")) {
    score = combatImpact > 0 ? score + combatImpact : -40;
  } else if (game.phase === "combat" && tags.includes("removal") && combatImpact > 0) {
    score += combatImpact;
  }

  return {
    ...getBaseFeatures(game, playerId, "activateAbility", score, tags, strategy, threat, ownQuality),
    actionType: "activateAbility",
    abilityId,
  };
}

export function scoreLegalAction(
  game: GameState,
  playerId: PlayerId,
  action: LegalAction,
  weights: AiPolicyWeights = defaultAiPolicyWeights,
): AiDecisionFeatures {
  const player = getPlayer(game, playerId);
  const opponent = getOpponent(game, playerId);
  const strategy = analyzeAiStrategy(game, playerId);

  if (action.type === "castSpell") return scoreSpellAction(game, playerId, action, weights);
  if (action.type === "playCreature") return scoreCreatureAction(game, playerId, action, weights);
  if (action.type === "activateAbility") return scoreActivatedAction(game, playerId, action, weights);

  return {
    ...getBaseFeatures(game, playerId, action.type, action.type === "pass" ? 0 : -1, action.type === "activateManaAbility" ? ["mana"] : [], strategy),
    actionType: action.type,
  };
}

export function chooseScoredAction(
  game: GameState,
  playerId: PlayerId,
  legalActions: LegalAction[],
  weights: AiPolicyWeights = defaultAiPolicyWeights,
): ScoredAction | null {
  const scored = legalActions
    .filter((action) => action.type !== "pass" && action.type !== "activateManaAbility")
    .map((action) => ({ action, features: scoreLegalAction(game, playerId, action, weights) }))
    .filter((entry) => entry.features.score > 0)
    .sort((first, second) => second.features.score - first.features.score);

  return scored[0] ?? null;
}

function maxAvailableBlockerRisk(attacker: CardInstance, blockers: CardInstance[]): number {
  let risk = 0;

  for (const blocker of blockers) {
    if (!canBlock(attacker, blocker)) {
      continue;
    }

    const attackerStats = getCreatureStats(attacker);
    const blockerStats = getCreatureStats(blocker);
    const blockerKills = hasKeyword(blocker, "Deathtouch") || blockerStats.power >= attackerStats.toughness;
    const attackerKills = hasKeyword(attacker, "Deathtouch") || attackerStats.power >= blockerStats.toughness;

    if (blockerKills && !attackerKills) risk = Math.max(risk, getCreatureQuality(attacker));
    if (blockerKills && attackerKills) risk = Math.max(risk, Math.max(1, getCreatureQuality(attacker) - getCreatureQuality(blocker)));
  }

  return risk;
}

export function chooseCombatPlanWithPolicy(
  game: GameState,
  playerId: PlayerId,
  weights: AiPolicyWeights = defaultAiPolicyWeights,
): CombatPlan {
  const player = getPlayer(game, playerId);
  const opponent = getOpponent(game, playerId);
  const strategy = analyzeAiStrategy(game, playerId);
  const strategyScale = getStrategyScale(strategy);
  const ownCreatures = getCreaturesOnBattlefield(player);
  const opponentBlockers = getCreaturesOnBattlefield(opponent).filter(canDefend);
  const attackers = ownCreatures
    .filter((creature) => canAttack(creature, game.turnNumber))
    .filter((creature) => {
      const stats = getCreatureStats(creature);
      let score = stats.power * weights.attackLifePressureWeight;

      if (opponent.lifeTotal <= stats.power) score += weights.lethalDetectionWeight;
      if (isEvasive(creature)) score += weights.evasionAttackWeight;
      if (hasKeyword(creature, "Lifelink")) score += weights.lifelinkAttackWeight;
      if (hasKeyword(creature, "Trample")) score += weights.trampleAttackWeight;
      if (hasKeyword(creature, "First strike") || hasKeyword(creature, "Double strike")) score += weights.firstStrikeTradeWeight;
      if (strategy.deckKind === "aggro") score += weights.strategyAggroAttackWeight * strategyScale;
      if (strategy.posture === "race") score += weights.strategyRaceAttackWeight * strategyScale;
      if (strategy.posture === "press") score += weights.strategyAggroAttackWeight * 0.5 * strategyScale;

      score -= maxAvailableBlockerRisk(creature, opponentBlockers) * weights.attackRiskWeight;
      if (player.lifeTotal <= 8 && canDefend(creature)) score -= weights.leaveBlockerWeight * Math.max(1, opponentBlockers.length);
      if (strategy.posture === "stabilize" && canDefend(creature)) score -= weights.strategyStabilizeBlockerWeight * Math.max(1, opponentBlockers.length) * strategyScale;
      if (strategy.deckKind === "control" && strategy.posture !== "race" && canDefend(creature)) score -= weights.strategyControlThreatPatienceWeight * 0.5 * strategyScale;

      return score > weights.attackTradeValueWeight || stats.power >= 2 || stats.power >= stats.toughness;
    });
  const attackerIds = new Set(attackers.map((creature) => creature.instanceId));
  const defenderIds = ownCreatures
    .filter((creature) => canDefend(creature))
    .filter((creature) => !attackerIds.has(creature.instanceId))
    .sort((first, second) => {
      const firstDeathtouch = hasKeyword(first, "Deathtouch") ? weights.deathtouchBlockWeight : 0;
      const secondDeathtouch = hasKeyword(second, "Deathtouch") ? weights.deathtouchBlockWeight : 0;
      return secondDeathtouch + getCreatureQuality(second) - (firstDeathtouch + getCreatureQuality(first));
    })
    .map((creature) => creature.instanceId);

  return {
    playerId,
    attackerIds: [...attackerIds],
    defenderIds,
  };
}

export function explainLegalActions(
  game: GameState,
  playerId: PlayerId,
  legalActions: LegalAction[],
  weights: AiPolicyWeights = defaultAiPolicyWeights,
): AiDecisionFeatures[] {
  return legalActions.map((action) => scoreLegalAction(game, playerId, action, weights));
}

export function canActionUseMoreMana(player: PlayerState, action: LegalAction): boolean {
  if (action.type !== "castSpell" && action.type !== "playCreature") {
    return false;
  }

  const card = getHandCard(player, action.cardInstanceId);
  return card ? getEffectiveManaCost(player, card, action.type === "castSpell" ? action.additionalCosts : []).length > 0 : false;
}
