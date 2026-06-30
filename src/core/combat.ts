import type { CardInstance, CombatPairing, CombatPlan, GameState, LegalAction, PlayerId, PlayerState } from "./types.js";
import { getLegalActions, getOpponent, getPlayer, getPriorityOrder, performAction } from "./actions.js";
import { dispatchGameEvent } from "./triggerEngine.js";
import { applyContinuousEffects } from "./staticEffects.js";

export type ChooseCombatPlan = (game: GameState, playerId: PlayerId) => CombatPlan;
export type ChooseCombatAction = (game: GameState, playerId: PlayerId, legalActions: LegalAction[]) => LegalAction;

export interface CreatureStats {
  power: number;
  toughness: number;
}

function log(game: GameState, message: string): void {
  game.log.push({
    turn: game.turnNumber,
    phase: "combat",
    message,
  });
}

function hasGameEnded(game: GameState): boolean {
  return game.status === "gameOver";
}

function isCreature(instance: CardInstance): boolean {
  return instance.card.cardTypes.includes("Creature");
}

export function hasKeyword(instance: CardInstance, keyword: string): boolean {
  const printedKeywords = instance.losesAbilities ? [] : instance.card.keywords;
  return [...printedKeywords, ...instance.staticKeywords, ...instance.temporaryKeywords].some(
    (candidate) => candidate.toLowerCase() === keyword.toLowerCase(),
  );
}

function hasFirstStrike(instance: CardInstance): boolean {
  return hasKeyword(instance, "First strike");
}

function hasDoubleStrike(instance: CardInstance): boolean {
  return hasKeyword(instance, "Double strike");
}

function hasTrample(instance: CardInstance): boolean {
  return hasKeyword(instance, "Trample");
}

function hasLifelink(instance: CardInstance): boolean {
  return hasKeyword(instance, "Lifelink");
}

function hasDeathtouch(instance: CardInstance): boolean {
  return hasKeyword(instance, "Deathtouch");
}

function hasMenace(instance: CardInstance): boolean {
  return hasKeyword(instance, "Menace");
}

function isUnblockable(instance: CardInstance): boolean {
  return hasKeyword(instance, "Unblockable");
}

export function getCreatureStats(instance: CardInstance): CreatureStats {
  const basePower = instance.basePowerOverride ?? (Number.parseInt(instance.card.power ?? "0", 10) || 0);
  const baseToughness = instance.baseToughnessOverride ?? (Number.parseInt(instance.card.toughness ?? "0", 10) || 0);

  return {
    power: basePower + instance.plusOneCounters + instance.staticPowerModifier + instance.powerModifier,
    toughness: baseToughness + instance.plusOneCounters + instance.staticToughnessModifier + instance.toughnessModifier,
  };
}

function isOnBattlefield(player: PlayerState, instanceId: string): boolean {
  return player.battlefield.some((instance) => instance.instanceId === instanceId);
}

function getBattlefieldCreature(player: PlayerState, instanceId: string): CardInstance | null {
  return player.battlefield.find((instance) => instance.instanceId === instanceId && isCreature(instance)) ?? null;
}

function getAttachedPermanents(player: PlayerState, permanentId: string): CardInstance[] {
  return player.battlefield.filter((instance) => instance.attachedToId === permanentId);
}

function hasPermanent(player: PlayerState, cardId: string): boolean {
  return player.battlefield.some((instance) => instance.card.id === cardId);
}

function hasSubtype(instance: CardInstance, subtype: string): boolean {
  return new RegExp(`\\b${subtype}\\b`, "i").test(instance.card.typeLine) || (instance.additionalSubtypes ?? []).includes(subtype);
}

export function getCreaturesOnBattlefield(player: PlayerState): CardInstance[] {
  return player.battlefield.filter(isCreature);
}

export function canAttack(instance: CardInstance, currentTurn: number): boolean {
  if (!isCreature(instance) || instance.tapped || instance.cannotAttack) {
    return false;
  }

  return instance.enteredTurn !== currentTurn || hasKeyword(instance, "Haste");
}

export function canDefend(instance: CardInstance): boolean {
  return isCreature(instance) && !instance.tapped && !instance.cannotDefend && !instance.temporaryCannotDefend;
}

export function canBlock(attacker: CardInstance, defender: CardInstance): boolean {
  if (isUnblockable(attacker)) {
    return false;
  }

  if (!canDefend(defender)) {
    return false;
  }

  if (hasKeyword(attacker, "Flying")) {
    return hasKeyword(defender, "Flying") || hasKeyword(defender, "Reach");
  }

  return true;
}

export function createSafeCombatPlan(game: GameState, playerId: PlayerId): CombatPlan {
  return {
    playerId,
    attackerIds: [],
    defenderIds: getCreaturesOnBattlefield(getPlayer(game, playerId))
      .filter(canDefend)
      .map((instance) => instance.instanceId),
  };
}

function choosePassCombatAction(_game: GameState, playerId: PlayerId, legalActions: LegalAction[]): LegalAction {
  return legalActions.find((action) => action.type === "pass") ?? { type: "pass", playerId };
}

function runCombatActionWindow(game: GameState, chooseCombatAction: ChooseCombatAction, label: string): void {
  if (chooseCombatAction === choosePassCombatAction) {
    return;
  }

  const priorityOrder = getPriorityOrder(game);
  const passedPlayers = new Set<PlayerId>();
  let actionCount = 0;

  log(game, `${label} combat action window begins.`);

  while (passedPlayers.size < game.players.length && !hasGameEnded(game)) {
    const playerId = priorityOrder[actionCount % priorityOrder.length];
    const legalActions = getLegalActions(game, playerId);
    const action = chooseCombatAction(game, playerId, legalActions);

    performAction(game, action);

    if (action.type === "pass") {
      passedPlayers.add(playerId);
    } else {
      passedPlayers.clear();
    }

    actionCount += 1;

    if (actionCount > 100) {
      throw new Error(`${label} combat action window exceeded action guard.`);
    }
  }

  applyStateBasedActions(game);
}

function wouldSurviveDamageFromBlockers(attacker: CardInstance, blockers: CardInstance[]): boolean {
  for (const blocker of blockers) {
    if (hasDeathtouch(blocker) && getCreatureStats(blocker).power > 0) {
      return false;
    }
  }

  const assignedDefenderPower = blockers.reduce(
    (total, blocker) => total + getCreatureStats(blocker).power,
    0,
  );

  return assignedDefenderPower < getCreatureStats(attacker).toughness - attacker.damageMarked;
}

function normalizeCombatPlan(game: GameState, playerId: PlayerId, plan: CombatPlan): CombatPlan {
  const player = getPlayer(game, playerId);
  const usedIds = new Set<string>();
  const attackerIds: string[] = [];
  const defenderIds: string[] = [];

  for (const attackerId of plan.attackerIds) {
    const attacker = getBattlefieldCreature(player, attackerId);

    if (attacker && canAttack(attacker, game.turnNumber) && !usedIds.has(attackerId)) {
      attackerIds.push(attackerId);
      usedIds.add(attackerId);
    }
  }

  for (const defenderId of plan.defenderIds) {
    const defender = getBattlefieldCreature(player, defenderId);

    if (defender && canDefend(defender) && !usedIds.has(defenderId)) {
      defenderIds.push(defenderId);
      usedIds.add(defenderId);
    }
  }

  return {
    playerId,
    attackerIds,
    defenderIds,
  };
}

function buildPairings(
  game: GameState,
  attackingPlayer: PlayerState,
  defendingPlayer: PlayerState,
  attackerIds: string[],
  defenderIds: string[],
): CombatPairing[] {
  const freeDefenderIds = defenderIds.filter((defenderId) => isOnBattlefield(defendingPlayer, defenderId));
  const pairings: CombatPairing[] = [];

  for (const attackerId of attackerIds) {
    const attacker = getBattlefieldCreature(attackingPlayer, attackerId);

    if (!attacker) {
      continue;
    }

    const defenderIndex = hasMenace(attacker) && freeDefenderIds.length < 2 ? -1 : freeDefenderIds.findIndex((defenderId) => {
      const defender = getBattlefieldCreature(defendingPlayer, defenderId);
      return defender ? canBlock(attacker, defender) : false;
    });

    if (defenderIndex === -1) {
      pairings.push({
        attackerId,
        defenderIds: [],
        defendingPlayerId: defendingPlayer.playerId,
      });
      continue;
    }

    const [defenderId] = freeDefenderIds.splice(defenderIndex, 1);
    pairings.push({
      attackerId,
      defenderIds: [defenderId],
      defendingPlayerId: defendingPlayer.playerId,
    });
  }

  for (const defenderId of [...freeDefenderIds]) {
    const defender = getBattlefieldCreature(defendingPlayer, defenderId);

    if (!defender) {
      continue;
    }

    const pairing = pairings.find((candidate) => {
      const attacker = getBattlefieldCreature(attackingPlayer, candidate.attackerId);

      if (!attacker || candidate.defenderIds.length === 0 || !canBlock(attacker, defender)) {
        return false;
      }

      const assignedDefenders = candidate.defenderIds
        .map((assignedDefenderId) => getBattlefieldCreature(defendingPlayer, assignedDefenderId))
        .filter((assignedDefender): assignedDefender is CardInstance => assignedDefender !== null);

      return wouldSurviveDamageFromBlockers(attacker, assignedDefenders);
    });

    if (pairing) {
      pairing.defenderIds.push(defenderId);
      freeDefenderIds.splice(freeDefenderIds.indexOf(defenderId), 1);
    }
  }

  log(game, `${attackingPlayer.playerId} attacks with ${pairings.length} creature(s).`);
  return pairings;
}

function moveToGraveyard(game: GameState, player: PlayerState, instance: CardInstance): void {
  const shouldReturnTappedWithCounter = instance.returnTappedWithCounterOnDeathUntilEndOfTurn === true;
  player.battlefield = player.battlefield.filter((candidate) => candidate.instanceId !== instance.instanceId);
  detachFromPermanent(game, instance.instanceId);
  instance.tapped = false;
  instance.damageMarked = 0;
  instance.deathtouchDamageMarked = 0;
  instance.powerModifier = 0;
  instance.toughnessModifier = 0;
  instance.staticPowerModifier = 0;
  instance.staticToughnessModifier = 0;
  instance.basePowerOverride = null;
  instance.baseToughnessOverride = null;
  instance.plusOneCounters = 0;
  instance.staticKeywords = [];
  instance.temporaryKeywords = [];
  instance.additionalSubtypes = [];
  instance.losesAbilities = false;
  instance.cannotAttack = false;
  instance.cannotDefend = false;
  instance.temporaryCannotDefend = false;
  instance.attachedToId = null;
  instance.exiledById = null;
  instance.doesNotUntap = false;
  instance.activatedAbilityIdsUsed = [];
  instance.returnTappedWithCounterOnDeathUntilEndOfTurn = false;
  player.graveyard.push(instance);

  if (shouldReturnTappedWithCounter) {
    const graveyardIndex = player.graveyard.findIndex((candidate) => candidate.instanceId === instance.instanceId);
    const [returned] = graveyardIndex === -1 ? [] : player.graveyard.splice(graveyardIndex, 1);

    if (returned) {
      returned.tapped = true;
      returned.damageMarked = 0;
      returned.deathtouchDamageMarked = 0;
      returned.powerModifier = 0;
      returned.toughnessModifier = 0;
      returned.staticPowerModifier = 0;
      returned.staticToughnessModifier = 0;
      returned.basePowerOverride = null;
      returned.baseToughnessOverride = null;
      returned.plusOneCounters = 1;
      returned.staticKeywords = [];
      returned.temporaryKeywords = [];
      returned.additionalSubtypes = [];
      returned.losesAbilities = false;
      returned.cannotAttack = false;
      returned.cannotDefend = false;
      returned.temporaryCannotDefend = false;
      returned.attachedToId = null;
      returned.exiledById = null;
      returned.doesNotUntap = false;
      returned.enteredTurn = game.turnNumber;
      returned.activatedAbilityIdsUsed = [];
      returned.returnTappedWithCounterOnDeathUntilEndOfTurn = false;
      player.battlefield.push(returned);
      dispatchGameEvent(game, {
        type: "creatureEntered",
        playerId: player.playerId,
        sourceId: returned.instanceId,
        details: { cardId: returned.card.id, from: "graveyard", tapped: true, plusOneCounter: true },
      });
    }
  }
}

function sacrificeCombatDamageSourcesSince(game: GameState, firstEventSequence: number): void {
  const sourceIds = new Set(
    game.events
      .filter(
        (event) =>
          event.sequence > firstEventSequence &&
          event.type === "damageDealt" &&
          event.details?.combat === true &&
          typeof event.sourceId === "string",
      )
      .map((event) => event.sourceId as string),
  );

  for (const player of game.players) {
    for (const creature of [...getCreaturesOnBattlefield(player)]) {
      if (!sourceIds.has(creature.instanceId) || !hasKeyword(creature, "SacrificeOnCombatDamage")) {
        continue;
      }

      moveToGraveyard(game, player, creature);
      dispatchGameEvent(game, {
        type: "permanentDied",
        playerId: player.playerId,
        sourceId: creature.instanceId,
        details: { cardId: creature.card.id, sacrificedAfterCombatDamage: true },
      });
      log(game, `${creature.card.name} is sacrificed after dealing combat damage.`);
    }
  }
}

function moveToExile(game: GameState, player: PlayerState, instance: CardInstance): void {
  player.battlefield = player.battlefield.filter((candidate) => candidate.instanceId !== instance.instanceId);
  detachFromPermanent(game, instance.instanceId);
  instance.tapped = false;
  instance.damageMarked = 0;
  instance.deathtouchDamageMarked = 0;
  instance.powerModifier = 0;
  instance.toughnessModifier = 0;
  instance.staticPowerModifier = 0;
  instance.staticToughnessModifier = 0;
  instance.basePowerOverride = null;
  instance.baseToughnessOverride = null;
  instance.staticKeywords = [];
  instance.temporaryKeywords = [];
  instance.additionalSubtypes = [];
  instance.losesAbilities = false;
  instance.cannotAttack = false;
  instance.cannotDefend = false;
  instance.temporaryCannotDefend = false;
  instance.attachedToId = null;
  instance.exiledById = null;
  instance.doesNotUntap = false;
  instance.enteredTurn = null;
  instance.activatedAbilityIdsUsed = [];
  instance.returnTappedWithCounterOnDeathUntilEndOfTurn = false;
  player.exile.push(instance);
}

export function detachFromPermanent(game: GameState, permanentId: string): void {
  for (const player of game.players) {
    for (const attachment of [...player.battlefield]) {
      if (attachment.attachedToId !== permanentId) {
        continue;
      }

      attachment.attachedToId = null;

      if (attachment.card.cardTypes.includes("Enchantment")) {
        player.battlefield = player.battlefield.filter((candidate) => candidate.instanceId !== attachment.instanceId);
        player.graveyard.push(attachment);
      }
    }
  }
}

export function applyStateBasedActions(game: GameState): void {
  applyContinuousEffects(game);

  for (const player of game.players) {
    for (const creature of [...getCreaturesOnBattlefield(player)]) {
      const { toughness } = getCreatureStats(creature);
      const hasZeroOrLessToughness = toughness <= 0;
      const hasLethalDamage =
        !hasKeyword(creature, "Indestructible") &&
        (creature.damageMarked >= toughness || creature.deathtouchDamageMarked > 0);

      if (hasZeroOrLessToughness || hasLethalDamage) {
        if (game.exileOnDeathUntilEndOfTurn.includes(creature.instanceId)) {
          moveToExile(game, player, creature);
          game.exileOnDeathUntilEndOfTurn = game.exileOnDeathUntilEndOfTurn.filter(
            (instanceId) => instanceId !== creature.instanceId,
          );
          dispatchGameEvent(game, {
            type: "permanentExiled",
            playerId: player.playerId,
            sourceId: creature.instanceId,
            details: { cardId: creature.card.id },
          });
          log(game, `${creature.card.name} is exiled instead of dying.`);
        } else {
          moveToGraveyard(game, player, creature);
          dispatchGameEvent(game, {
            type: "permanentDied",
            playerId: player.playerId,
            sourceId: creature.instanceId,
            details: { cardId: creature.card.id },
          });
          log(game, `${creature.card.name} dies.`);
        }
      }
    }
  }

  applyContinuousEffects(game);
}

function setGameOverFromLifeLoss(game: GameState): void {
  const losers = game.players.filter((player) => player.lifeTotal <= 0);

  if (losers.length === 0) {
    return;
  }

  const loserIds =
    losers.length === game.players.length
      ? [game.attackingPriorityPlayerId]
      : losers.map((player) => player.playerId);
  const winner = game.players.find((player) => !loserIds.includes(player.playerId));

  game.status = "gameOver";
  game.phase = "gameOver";
  game.loserIds = loserIds;
  game.winnerId = winner?.playerId ?? null;
  dispatchGameEvent(game, {
    type: "gameEnded",
    playerId: game.winnerId ?? undefined,
    details: { reason: "lifeTotal" },
  });
  log(game, `Game over. Winner: ${game.winnerId ?? "none"}.`);
}

function getLethalDamageRequired(source: CardInstance, target: CardInstance): number {
  if (target.damageMarked >= getCreatureStats(target).toughness || target.deathtouchDamageMarked > 0) {
    return 0;
  }

  if (hasDeathtouch(source)) {
    return 1;
  }

  return Math.max(0, getCreatureStats(target).toughness - target.damageMarked);
}

function isLethalDamageFor(source: CardInstance, target: CardInstance, damage: number): boolean {
  if (damage <= 0) {
    return false;
  }

  return hasDeathtouch(source) || target.damageMarked + damage >= getCreatureStats(target).toughness;
}

function gainLifeFromLifelink(game: GameState, source: CardInstance, damage: number): void {
  if (damage <= 0 || !hasLifelink(source)) {
    return;
  }

  const controller = getPlayer(game, source.ownerId);
  controller.lifeTotal += damage;
  dispatchGameEvent(game, {
    type: "lifeGained",
    playerId: controller.playerId,
    sourceId: source.instanceId,
    amount: damage,
  });
  log(game, `${controller.playerId} gains ${damage} life from ${source.card.name}.`);
}

function dealDamageToPlayer(game: GameState, source: CardInstance, defendingPlayer: PlayerState, damage: number): void {
  if (damage <= 0) {
    return;
  }

  defendingPlayer.lifeTotal -= damage;
  gainLifeFromLifelink(game, source, damage);
  dispatchGameEvent(game, {
    type: "damageDealt",
    playerId: source.ownerId,
    sourceId: source.instanceId,
    targetId: defendingPlayer.playerId,
    amount: damage,
    details: { targetType: "player", combat: true },
  });
  log(game, `${source.card.name} deals ${damage} damage to ${defendingPlayer.playerId}.`);
  setGameOverFromLifeLoss(game);
}

function dealDamageToCreature(game: GameState, source: CardInstance, target: CardInstance, damage: number): void {
  if (damage <= 0) {
    return;
  }

  target.damageMarked += damage;
  if (hasDeathtouch(source)) {
    target.deathtouchDamageMarked += damage;
  }
  gainLifeFromLifelink(game, source, damage);
  dispatchGameEvent(game, {
    type: "damageDealt",
    playerId: source.ownerId,
    sourceId: source.instanceId,
    targetId: target.instanceId,
    amount: damage,
    details: { targetType: "creature", combat: true },
  });
}

function dealAttackerDamageToBlockers(
  game: GameState,
  attacker: CardInstance,
  blockers: CardInstance[],
  defendingPlayer: PlayerState,
): void {
  let remainingPower = getCreatureStats(attacker).power;
  let trampleDamage = 0;

  for (const blocker of blockers) {
    if (remainingPower <= 0) {
      break;
    }

    const lethalDamage = getLethalDamageRequired(attacker, blocker);
    const damage = Math.min(remainingPower, lethalDamage || remainingPower);
    const isLethalDamage = isLethalDamageFor(attacker, blocker, damage);
    dealDamageToCreature(game, attacker, blocker, damage);
    remainingPower -= damage;

    if (damage > 0 && isLethalDamage) {
      log(game, `${attacker.card.name} assigns lethal damage to ${blocker.card.name}.`);
    }
  }

  if (hasTrample(attacker) && remainingPower > 0) {
    trampleDamage = remainingPower;
  }

  dealDamageToPlayer(game, attacker, defendingPlayer, trampleDamage);
}

function shouldDealDamageInFirstStrikeStep(instance: CardInstance): boolean {
  return hasFirstStrike(instance) || hasDoubleStrike(instance);
}

function shouldDealDamageInRegularStep(instance: CardInstance, hasFirstStrikeStep: boolean): boolean {
  if (!hasFirstStrikeStep) {
    return true;
  }

  return !hasFirstStrike(instance) || hasDoubleStrike(instance);
}

function dealCombatDamageStep(
  game: GameState,
  attackingPlayer: PlayerState,
  defendingPlayer: PlayerState,
  attacker: CardInstance,
  blockers: CardInstance[],
  step: "firstStrike" | "regular",
  hasFirstStrikeStep: boolean,
  wasBlocked: boolean,
): void {
  const currentAttacker = getBattlefieldCreature(attackingPlayer, attacker.instanceId);
  const firstEventSequence = game.events.length;

  if (!currentAttacker) {
    return;
  }

  const currentBlockers = blockers
    .map((blocker) => getBattlefieldCreature(defendingPlayer, blocker.instanceId))
    .filter((blocker): blocker is CardInstance => blocker !== null);
  const attackerDealsDamage =
    step === "firstStrike"
      ? shouldDealDamageInFirstStrikeStep(currentAttacker)
      : shouldDealDamageInRegularStep(currentAttacker, hasFirstStrikeStep);

  if (attackerDealsDamage) {
    if (currentBlockers.length === 0) {
      if (!wasBlocked || hasTrample(currentAttacker)) {
        dealDamageToPlayer(game, currentAttacker, defendingPlayer, getCreatureStats(currentAttacker).power);
      }
    } else {
      dealAttackerDamageToBlockers(game, currentAttacker, currentBlockers, defendingPlayer);
    }
  }

  for (const blocker of currentBlockers) {
    const blockerDealsDamage =
      step === "firstStrike"
        ? shouldDealDamageInFirstStrikeStep(blocker)
        : shouldDealDamageInRegularStep(blocker, hasFirstStrikeStep);

    if (blockerDealsDamage && getBattlefieldCreature(attackingPlayer, currentAttacker.instanceId)) {
      dealDamageToCreature(game, blocker, currentAttacker, getCreatureStats(blocker).power);
    }
  }

  applyStateBasedActions(game);
  sacrificeCombatDamageSourcesSince(game, firstEventSequence);
}

function resolvePairing(
  game: GameState,
  attackingPlayer: PlayerState,
  defendingPlayer: PlayerState,
  pairing: CombatPairing,
): void {
  const attacker = getBattlefieldCreature(attackingPlayer, pairing.attackerId);

  if (!attacker) {
    return;
  }

  const blockers = pairing.defenderIds
    .map((defenderId) => getBattlefieldCreature(defendingPlayer, defenderId))
    .filter((defender): defender is CardInstance => defender !== null);

  if (blockers.length === 0) {
    const hasFirstStrikeStep = shouldDealDamageInFirstStrikeStep(attacker);
    dealCombatDamageStep(game, attackingPlayer, defendingPlayer, attacker, [], "firstStrike", hasFirstStrikeStep, false);
    if (!hasGameEnded(game)) {
      dealCombatDamageStep(game, attackingPlayer, defendingPlayer, attacker, [], "regular", hasFirstStrikeStep, false);
    }
    return;
  }

  log(
    game,
    `${attacker.card.name} is blocked by ${blockers.map((blocker) => blocker.card.name).join(", ")}.`,
  );

  const hasFirstStrikeStep = [attacker, ...blockers].some(shouldDealDamageInFirstStrikeStep);
  if (hasFirstStrikeStep) {
    dealCombatDamageStep(game, attackingPlayer, defendingPlayer, attacker, blockers, "firstStrike", hasFirstStrikeStep, true);
  }

  if (!hasGameEnded(game)) {
    dealCombatDamageStep(game, attackingPlayer, defendingPlayer, attacker, blockers, "regular", hasFirstStrikeStep, true);
  }
}

function resolveAttack(
  game: GameState,
  attackingPlayer: PlayerState,
  defendingPlayer: PlayerState,
  attackingPlan: CombatPlan,
  defendingPlan: CombatPlan,
): void {
  const pairings = buildPairings(
    game,
    attackingPlayer,
    defendingPlayer,
    attackingPlan.attackerIds,
    defendingPlan.defenderIds,
  );

  for (const pairing of pairings) {
    if (game.status === "gameOver") {
      return;
    }

    resolvePairing(game, attackingPlayer, defendingPlayer, pairing);
  }
}

export function resolveCombatPhase(
  game: GameState,
  chooseCombatPlan: ChooseCombatPlan,
  chooseCombatAction: ChooseCombatAction = choosePassCombatAction,
): void {
  if (game.status === "gameOver") {
    return;
  }

  applyContinuousEffects(game);
  game.phase = "combat";
  log(game, "Combat phase begins.");
  dispatchGameEvent(game, {
    type: "combatStarted",
    playerId: game.attackingPriorityPlayerId,
  });

  runCombatActionWindow(game, chooseCombatAction, "Beginning");

  if (hasGameEnded(game)) {
    return;
  }

  const plans = new Map<PlayerId, CombatPlan>();

  for (const player of game.players) {
    const plan = normalizeCombatPlan(game, player.playerId, chooseCombatPlan(game, player.playerId));
    plans.set(player.playerId, plan);

    for (const attackerId of plan.attackerIds) {
      const attacker = getBattlefieldCreature(player, attackerId);

      if (attacker) {
        if (!hasKeyword(attacker, "Vigilance")) {
          attacker.tapped = true;
        }

        if (attacker.card.id === "kitesail_corsair") {
          attacker.temporaryKeywords.push("Flying");
        }

        if (getAttachedPermanents(player, attacker.instanceId).some((attachment) => attachment.card.id === "quick_draw_katana")) {
          attacker.powerModifier += 2;
          attacker.temporaryKeywords.push("First strike");
        }

        if (hasPermanent(player, "goblin_oriflamme")) {
          attacker.powerModifier += 1;
        }

        if (hasPermanent(player, "crossway_troublemakers") && hasSubtype(attacker, "Vampire")) {
          attacker.temporaryKeywords.push("Deathtouch", "Lifelink");
        }

        dispatchGameEvent(game, {
          type: "creatureAttacked",
          playerId: player.playerId,
          sourceId: attacker.instanceId,
          details: { cardId: attacker.card.id },
        });
      }
    }

    if (plan.attackerIds.length > 0) {
      dispatchGameEvent(game, {
        type: "creaturesAttacked",
        playerId: player.playerId,
        amount: plan.attackerIds.length,
      });
    }

    log(
      game,
      `${player.playerId} positions ${plan.attackerIds.length} attacker(s), ${plan.defenderIds.length} defender(s).`,
    );
  }

  dispatchGameEvent(game, {
    type: "combatPositioningEnded",
    playerId: game.attackingPriorityPlayerId,
  });

  runCombatActionWindow(game, chooseCombatAction, "Post-positioning");

  if (hasGameEnded(game)) {
    return;
  }

  const [firstAttackerId, secondAttackerId] = getPriorityOrder(game);
  const firstAttacker = getPlayer(game, firstAttackerId);
  const firstDefender = getOpponent(game, firstAttackerId);
  resolveAttack(game, firstAttacker, firstDefender, plans.get(firstAttackerId)!, plans.get(firstDefender.playerId)!);

  if (!hasGameEnded(game)) {
    const secondAttacker = getPlayer(game, secondAttackerId);
    const secondDefender = getOpponent(game, secondAttackerId);
    resolveAttack(game, secondAttacker, secondDefender, plans.get(secondAttackerId)!, plans.get(secondDefender.playerId)!);
  }
}

export function clearCombatDamage(game: GameState): void {
  for (const player of game.players) {
    for (const creature of getCreaturesOnBattlefield(player)) {
      creature.damageMarked = 0;
      creature.deathtouchDamageMarked = 0;
      creature.powerModifier = 0;
      creature.toughnessModifier = 0;
      creature.temporaryKeywords = [];
      creature.temporaryCannotDefend = false;
    }
  }
}
