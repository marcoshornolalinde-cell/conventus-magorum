import type { Card, CardInstance, GameState, LegalAction, PlayerId, PlayerState } from "./types.js";
import { canPayManaCost, spendManaCost } from "./mana.js";
import { dispatchGameEvent } from "./triggerEngine.js";

type ActivatedEffect =
  | { type: "drawCards"; amount: number }
  | { type: "drainOpponent"; amount: number }
  | { type: "addCountersToSource"; amount: number }
  | { type: "pumpAttackingCreaturesByAttackerCount" }
  | { type: "addCounterToTargetAndMaybeFirstStrike"; amount: number; subtype: string }
  | { type: "pumpTarget"; power: number; toughness: number; keywords?: string[] }
  | { type: "becomeWerewolfThenCountersAndDraw"; counters: number }
  | { type: "grantUnblockable" }
  | { type: "grantFlyingAndSacrificeOnCombatDamage" }
  | { type: "destroyTargetPermanent" }
  | { type: "returnSourceFromGraveyardToBattlefieldTapped" }
  | { type: "exileSourceFromGraveyard" }
  | {
      type: "createToken";
      count: number;
      token: {
        name: string;
        color: string;
        cardTypes: string[];
        subtypes: string[];
        power: string | null;
        toughness: string | null;
        keywords?: string[];
      };
    };

interface ActivatedCost {
  manaCost?: string;
  tap?: boolean;
  sacrificeSelf?: boolean;
  sacrificeAnotherCreature?: boolean;
}

interface ActivatedAbilityProfile {
  id: string;
  sourceZone: "battlefield" | "graveyard";
  cost: ActivatedCost;
  targetMode:
    | "none"
    | "anyCreature"
    | "anotherAttackingCreatureYouControl"
    | "anotherGoblinYouControl"
    | "anotherCreaturePowerTwoOrLess"
    | "anyPermanent"
    | "artifactOrEnchantment"
    | "sacrificeAnotherCreature";
  activateOnlyOnce?: boolean;
  effects: ActivatedEffect[];
}

function normalizeText(card: Card): string {
  return card.gameText.replace(/\s+/g, " ").trim();
}

function isCreature(instance: CardInstance): boolean {
  return instance.card.cardTypes.includes("Creature");
}

function hasKeyword(instance: CardInstance, keyword: string): boolean {
  const printedKeywords = instance.losesAbilities ? [] : instance.card.keywords;
  return [...printedKeywords, ...instance.staticKeywords, ...instance.temporaryKeywords].some(
    (candidate) => candidate.toLowerCase() === keyword.toLowerCase(),
  );
}

function hasSubtype(instance: CardInstance, subtype: string): boolean {
  return new RegExp(`\\b${subtype}\\b`, "i").test(instance.card.typeLine) || (instance.additionalSubtypes ?? []).includes(subtype);
}

function getCreatureStats(instance: CardInstance): { power: number; toughness: number } {
  const basePower = instance.basePowerOverride ?? (Number.parseInt(instance.card.power ?? "0", 10) || 0);
  const baseToughness = instance.baseToughnessOverride ?? (Number.parseInt(instance.card.toughness ?? "0", 10) || 0);

  return {
    power: basePower + instance.plusOneCounters + instance.staticPowerModifier + instance.powerModifier,
    toughness: baseToughness + instance.plusOneCounters + instance.staticToughnessModifier + instance.toughnessModifier,
  };
}

function canUseTapCost(source: CardInstance, turnNumber: number): boolean {
  if (source.tapped || source.losesAbilities) {
    return false;
  }

  if (!isCreature(source)) {
    return true;
  }

  return source.enteredTurn !== turnNumber || hasKeyword(source, "Haste");
}

function getPlayer(game: GameState, playerId: PlayerId): PlayerState {
  const player = game.players.find((candidate) => candidate.playerId === playerId);

  if (!player) {
    throw new Error(`Unknown player ${playerId}.`);
  }

  return player;
}

function getOpponent(game: GameState, playerId: PlayerId): PlayerState {
  const opponent = game.players.find((candidate) => candidate.playerId !== playerId);

  if (!opponent) {
    throw new Error(`Player ${playerId} has no opponent.`);
  }

  return opponent;
}

function findPermanentController(game: GameState, instanceId: string): PlayerState | null {
  return game.players.find((player) => player.battlefield.some((instance) => instance.instanceId === instanceId)) ?? null;
}

function findPermanent(game: GameState, instanceId: string): CardInstance | null {
  const controller = findPermanentController(game, instanceId);
  return controller?.battlefield.find((instance) => instance.instanceId === instanceId) ?? null;
}

function resetForGraveyard(instance: CardInstance): void {
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
}

function resetForBattlefield(instance: CardInstance, turnNumber: number, tapped: boolean): void {
  instance.tapped = tapped;
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
  instance.enteredTurn = turnNumber;
  instance.activatedAbilityIdsUsed = [];
  instance.returnTappedWithCounterOnDeathUntilEndOfTurn = false;
}

function returnCardsExiledBy(game: GameState, sourceId: string): void {
  for (const player of game.players) {
    for (const exiled of [...player.exile]) {
      if (exiled.exiledById !== sourceId) {
        continue;
      }

      player.exile = player.exile.filter((candidate) => candidate.instanceId !== exiled.instanceId);
      resetForBattlefield(exiled, game.turnNumber, false);
      player.battlefield.push(exiled);
      dispatchGameEvent(game, {
        type: "permanentReturnedToBattlefield",
        playerId: player.playerId,
        sourceId,
        targetId: exiled.instanceId,
        details: { cardId: exiled.card.id, from: "exile" },
      });
    }
  }
}

function returnFromGraveyardTappedWithCounter(game: GameState, instance: CardInstance): void {
  const owner = getPlayer(game, instance.ownerId);
  const graveyardIndex = owner.graveyard.findIndex((candidate) => candidate.instanceId === instance.instanceId);
  const [returned] = graveyardIndex === -1 ? [] : owner.graveyard.splice(graveyardIndex, 1);

  if (!returned) {
    return;
  }

  resetForBattlefield(returned, game.turnNumber, true);
  returned.plusOneCounters = 1;
  owner.battlefield.push(returned);
  dispatchGameEvent(game, {
    type: "creatureEntered",
    playerId: owner.playerId,
    sourceId: returned.instanceId,
    details: { cardId: returned.card.id, from: "graveyard", tapped: true, plusOneCounter: true },
  });
}

function detachAttachments(game: GameState, permanentId: string): void {
  for (const player of game.players) {
    for (const attachment of [...player.battlefield]) {
      if (attachment.attachedToId !== permanentId) {
        continue;
      }

      attachment.attachedToId = null;

      if (attachment.card.cardTypes.includes("Enchantment")) {
        player.battlefield = player.battlefield.filter((candidate) => candidate.instanceId !== attachment.instanceId);
        resetForGraveyard(attachment);
        player.graveyard.push(attachment);
      }
    }
  }
}

function movePermanentToGraveyard(game: GameState, instanceId: string): void {
  const controller = findPermanentController(game, instanceId);
  const permanent = controller?.battlefield.find((candidate) => candidate.instanceId === instanceId);

  if (!controller || !permanent || hasKeyword(permanent, "Indestructible")) {
    return;
  }

  const shouldReturnTappedWithCounter = permanent.returnTappedWithCounterOnDeathUntilEndOfTurn === true;
  controller.battlefield = controller.battlefield.filter((candidate) => candidate.instanceId !== instanceId);
  returnCardsExiledBy(game, permanent.instanceId);
  detachAttachments(game, permanent.instanceId);
  resetForGraveyard(permanent);
  controller.graveyard.push(permanent);
  dispatchGameEvent(game, {
    type: "permanentDied",
    playerId: controller.playerId,
    sourceId: permanent.instanceId,
    details: { cardId: permanent.card.id },
  });

  if (shouldReturnTappedWithCounter) {
    returnFromGraveyardTappedWithCounter(game, permanent);
  }
}

function drawCards(game: GameState, player: PlayerState, amount: number): void {
  for (let index = 0; index < amount; index += 1) {
    const [card, ...remainingDeck] = player.spellDeck;

    if (!card) {
      game.status = "gameOver";
      game.phase = "gameOver";
      game.loserIds = [player.playerId];
      game.winnerId = getOpponent(game, player.playerId).playerId;
      return;
    }

    player.spellDeck = remainingDeck;
    player.hand.push(card);
    player.cardsDrawnThisTurn += 1;
    dispatchGameEvent(game, {
      type: "cardDrawn",
      playerId: player.playerId,
      sourceId: card.instanceId,
      details: { cardId: card.card.id },
    });
  }
}

function createToken(
  game: GameState,
  controller: PlayerState,
  source: CardInstance,
  effect: Extract<ActivatedEffect, { type: "createToken" }>,
): void {
  for (let index = 0; index < effect.count; index += 1) {
    const tokenCard: Card = {
      id: `token:${effect.token.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      name: effect.token.name,
      manaCost: "",
      manaValue: 0,
      colorIdentity: effect.token.color === "Colorless" ? [] : [effect.token.color],
      colorNames: effect.token.color === "Colorless" ? [] : [effect.token.color],
      typeLine: `Token ${effect.token.cardTypes.join(" ")}${effect.token.subtypes.length > 0 ? ` - ${effect.token.subtypes.join(" ")}` : ""}`,
      cardTypes: effect.token.cardTypes,
      isLand: false,
      isBasicLand: false,
      landMana: null,
      power: effect.token.power,
      toughness: effect.token.toughness,
      keywords: effect.token.keywords ?? [],
      keywordIds: [],
      oracleText: "",
      gameText: "",
    };
    const token: CardInstance = {
      instanceId: `${source.instanceId}:token:${game.events.length}:${index}`,
      ownerId: controller.playerId,
      sourceArchetypeId: source.sourceArchetypeId,
      card: tokenCard,
      isToken: true,
      tapped: false,
      damageMarked: 0,
      deathtouchDamageMarked: 0,
      powerModifier: 0,
      toughnessModifier: 0,
      staticPowerModifier: 0,
      staticToughnessModifier: 0,
      basePowerOverride: null,
      baseToughnessOverride: null,
      plusOneCounters: 0,
      staticKeywords: [],
      temporaryKeywords: [],
      additionalSubtypes: [],
      losesAbilities: false,
      cannotAttack: false,
      cannotDefend: false,
      temporaryCannotDefend: false,
      attachedToId: null,
      doesNotUntap: false,
      enteredTurn: game.turnNumber,
      activatedAbilityIdsUsed: [],
    };

    controller.battlefield.push(token);
    dispatchGameEvent(game, {
      type: "tokenCreated",
      playerId: controller.playerId,
      sourceId: source.instanceId,
      targetId: token.instanceId,
      details: { tokenName: effect.token.name },
    });

    if (token.card.cardTypes.includes("Creature")) {
      dispatchGameEvent(game, {
        type: "creatureEntered",
        playerId: controller.playerId,
        sourceId: token.instanceId,
        details: { cardId: token.card.id, token: true },
      });
    }
  }
}

function getTargets(game: GameState, player: PlayerState, source: CardInstance, profile: ActivatedAbilityProfile): string[][] {
  if (profile.targetMode === "none") {
    return [[]];
  }

  if (profile.targetMode === "sacrificeAnotherCreature") {
    return player.battlefield
      .filter((permanent) => permanent.instanceId !== source.instanceId && isCreature(permanent))
      .map((permanent) => [permanent.instanceId]);
  }

  if (profile.targetMode === "anyCreature") {
    return game.players
      .flatMap((candidate) => candidate.battlefield)
      .filter(isCreature)
      .map((permanent) => [permanent.instanceId]);
  }

  if (profile.targetMode === "anotherAttackingCreatureYouControl") {
    const attackingIds = new Set(
      game.events
        .filter((event) => event.turn === game.turnNumber && event.type === "creatureAttacked" && event.playerId === player.playerId)
        .map((event) => event.sourceId)
        .filter((sourceId): sourceId is string => typeof sourceId === "string"),
    );
    return player.battlefield
      .filter((permanent) => permanent.instanceId !== source.instanceId && isCreature(permanent) && attackingIds.has(permanent.instanceId))
      .map((creature) => [creature.instanceId]);
  }

  if (profile.targetMode === "anotherGoblinYouControl") {
    return player.battlefield
      .filter((permanent) => permanent.instanceId !== source.instanceId && isCreature(permanent) && hasSubtype(permanent, "Goblin"))
      .map((creature) => [creature.instanceId]);
  }

  if (profile.targetMode === "anotherCreaturePowerTwoOrLess") {
    const opponent = getOpponent(game, player.playerId);
    return [...player.battlefield, ...opponent.battlefield]
      .filter((permanent) => permanent.instanceId !== source.instanceId && isCreature(permanent))
      .filter((creature) => getCreatureStats(creature).power <= 2)
      .map((creature) => [creature.instanceId]);
  }

  if (profile.targetMode === "artifactOrEnchantment") {
    const opponent = getOpponent(game, player.playerId);
    return [...opponent.battlefield, ...player.battlefield]
      .filter((permanent) => permanent.card.cardTypes.includes("Artifact") || permanent.card.cardTypes.includes("Enchantment"))
      .filter((permanent) => permanent.instanceId !== source.instanceId)
      .map((permanent) => [permanent.instanceId]);
  }

  const opponent = getOpponent(game, player.playerId);
  return [...opponent.battlefield, ...player.battlefield]
    .filter((permanent) => permanent.instanceId !== source.instanceId)
    .map((permanent) => [permanent.instanceId]);
}

export function getActivatedAbilityProfile(card: Card): ActivatedAbilityProfile | null {
  const text = normalizeText(card);

  if (card.id === "vampire_neonate") {
    return {
      id: "vampire_neonate:drain",
      sourceZone: "battlefield",
      cost: { manaCost: "{2}", tap: true },
      targetMode: "none",
      effects: [{ type: "drainOpponent", amount: 1 }],
    };
  }

  if (card.id === "spectral_sailor") {
    return {
      id: "spectral_sailor:draw",
      sourceZone: "battlefield",
      cost: { manaCost: "{3}{U}" },
      targetMode: "none",
      effects: [{ type: "drawCards", amount: 1 }],
    };
  }

  if (card.id === "mystic_archaeologist") {
    return {
      id: "mystic_archaeologist:draw",
      sourceZone: "battlefield",
      cost: { manaCost: "{3}{U}{U}" },
      targetMode: "none",
      effects: [{ type: "drawCards", amount: 2 }],
    };
  }

  if (card.id === "hungry_ghoul") {
    return {
      id: "hungry_ghoul:sacrifice_counter",
      sourceZone: "battlefield",
      cost: { manaCost: "{1}", sacrificeAnotherCreature: true },
      targetMode: "sacrificeAnotherCreature",
      effects: [{ type: "addCountersToSource", amount: 1 }],
    };
  }

  if (card.id === "goblin_firebomb") {
    return {
      id: "goblin_firebomb:destroy",
      sourceZone: "battlefield",
      cost: { manaCost: "{7}", tap: true, sacrificeSelf: true },
      targetMode: "anyPermanent",
      effects: [{ type: "destroyTargetPermanent" }],
    };
  }

  if (card.id === "wildheart_invoker") {
    return {
      id: "wildheart_invoker:pump",
      sourceZone: "battlefield",
      cost: { manaCost: "{8}" },
      targetMode: "anyCreature",
      effects: [{ type: "pumpTarget", power: 5, toughness: 5, keywords: ["Trample"] }],
    };
  }

  if (card.id === "mild_mannered_librarian") {
    return {
      id: "mild_mannered_librarian:transform",
      sourceZone: "battlefield",
      cost: { manaCost: "{3}{G}" },
      targetMode: "none",
      activateOnlyOnce: true,
      effects: [{ type: "becomeWerewolfThenCountersAndDraw", counters: 2 }],
    };
  }

  if (card.id === "thrashing_brontodon") {
    return {
      id: "thrashing_brontodon:destroy",
      sourceZone: "battlefield",
      cost: { manaCost: "{1}", sacrificeSelf: true },
      targetMode: "artifactOrEnchantment",
      effects: [{ type: "destroyTargetPermanent" }],
    };
  }

  if (card.id === "goblin_smuggler") {
    return {
      id: "goblin_smuggler:unblockable",
      sourceZone: "battlefield",
      cost: { tap: true },
      targetMode: "anotherCreaturePowerTwoOrLess",
      effects: [{ type: "grantUnblockable" }],
    };
  }

  if (card.id === "jazal_goldmane") {
    return {
      id: "jazal_goldmane:attacking_pump",
      sourceZone: "battlefield",
      cost: { manaCost: "{3}{W}{W}" },
      targetMode: "none",
      effects: [{ type: "pumpAttackingCreaturesByAttackerCount" }],
    };
  }

  if (card.id === "ingenious_leonin") {
    return {
      id: "ingenious_leonin:attacking_counter",
      sourceZone: "battlefield",
      cost: { manaCost: "{3}{W}" },
      targetMode: "anotherAttackingCreatureYouControl",
      effects: [{ type: "addCounterToTargetAndMaybeFirstStrike", amount: 1, subtype: "Cat" }],
    };
  }

  if (card.id === "dropkick_bomber") {
    return {
      id: "dropkick_bomber:flying_sacrifice",
      sourceZone: "battlefield",
      cost: { manaCost: "{R}" },
      targetMode: "anotherGoblinYouControl",
      effects: [{ type: "grantFlyingAndSacrificeOnCombatDamage" }],
    };
  }

  if (card.id === "reassembling_skeleton") {
    return {
      id: "reassembling_skeleton:return_tapped",
      sourceZone: "graveyard",
      cost: { manaCost: "{1}{B}" },
      targetMode: "none",
      effects: [{ type: "returnSourceFromGraveyardToBattlefieldTapped" }],
    };
  }

  if (card.id === "suspicious_shambler") {
    return {
      id: "suspicious_shambler:create_zombies",
      sourceZone: "graveyard",
      cost: { manaCost: "{4}{B}{B}" },
      targetMode: "none",
      effects: [
        { type: "exileSourceFromGraveyard" },
        {
          type: "createToken",
          count: 2,
          token: {
            name: "Zombie Token",
            color: "Black",
            cardTypes: ["Creature"],
            subtypes: ["Zombie"],
            power: "2",
            toughness: "2",
          },
        },
      ],
    };
  }

  if (/\{T}: Add \{R}\./i.test(text) && card.id === "carnelian_orb_of_dragonkind") {
    return null;
  }

  return null;
}

function canPayActivatedCost(player: PlayerState, source: CardInstance, profile: ActivatedAbilityProfile, turnNumber: number): boolean {
  if (profile.activateOnlyOnce && source.activatedAbilityIdsUsed.includes(profile.id)) {
    return false;
  }

  if (profile.cost.tap && !canUseTapCost(source, turnNumber)) {
    return false;
  }

  if (profile.cost.manaCost && !canPayManaCost(player.manaPool, profile.cost.manaCost)) {
    return false;
  }

  if (profile.cost.sacrificeAnotherCreature && !player.battlefield.some((permanent) => permanent.instanceId !== source.instanceId && isCreature(permanent))) {
    return false;
  }

  return true;
}

export function getActivatedAbilityActions(game: GameState, playerId: PlayerId): LegalAction[] {
  const player = getPlayer(game, playerId);
  const actions: LegalAction[] = [];

  for (const source of player.battlefield) {
    const profile = getActivatedAbilityProfile(source.card);

    if (!profile || profile.sourceZone !== "battlefield" || !canPayActivatedCost(player, source, profile, game.turnNumber)) {
      continue;
    }

    for (const targetIds of getTargets(game, player, source, profile)) {
      actions.push({
        type: "activateAbility",
        playerId,
        sourceId: source.instanceId,
        abilityId: profile.id,
        targetIds,
      });
    }
  }

  for (const source of player.graveyard) {
    const profile = getActivatedAbilityProfile(source.card);

    if (!profile || profile.sourceZone !== "graveyard" || !canPayActivatedCost(player, source, profile, game.turnNumber)) {
      continue;
    }

    actions.push({
      type: "activateAbility",
      playerId,
      sourceId: source.instanceId,
      abilityId: profile.id,
      targetIds: [],
    });
  }

  return actions;
}

function payActivatedCost(game: GameState, player: PlayerState, source: CardInstance, profile: ActivatedAbilityProfile, action: Extract<LegalAction, { type: "activateAbility" }>): void {
  source.activatedAbilityIdsUsed.push(profile.id);

  if (profile.cost.manaCost) {
    player.manaPool = spendManaCost(player.manaPool, profile.cost.manaCost);
  }

  if (profile.cost.tap) {
    source.tapped = true;
  }

  if (profile.cost.sacrificeAnotherCreature) {
    movePermanentToGraveyard(game, action.targetIds[0]);
  }

  if (profile.cost.sacrificeSelf) {
    movePermanentToGraveyard(game, source.instanceId);
  }
}

export function resolveActivatedAbility(game: GameState, action: Extract<LegalAction, { type: "activateAbility" }>): void {
  const player = getPlayer(game, action.playerId);
  const source =
    player.battlefield.find((permanent) => permanent.instanceId === action.sourceId) ??
    player.graveyard.find((card) => card.instanceId === action.sourceId);

  if (!source) {
    throw new Error(`Activated ability source ${action.sourceId} is not on ${player.playerId}'s battlefield.`);
  }

  const profile = getActivatedAbilityProfile(source.card);

  if (!profile || !canPayActivatedCost(player, source, profile, game.turnNumber)) {
    throw new Error(`${source.card.name} cannot activate ${action.abilityId}.`);
  }

  payActivatedCost(game, player, source, profile, action);
  dispatchGameEvent(game, {
    type: "abilityActivated",
    playerId: player.playerId,
    sourceId: source.instanceId,
    details: { cardId: source.card.id, abilityId: profile.id },
  });

  const target = action.targetIds[0] ? findPermanent(game, action.targetIds[0]) : null;

  for (const effect of profile.effects) {
    if (effect.type === "drawCards") {
      drawCards(game, player, effect.amount);
    }

    if (effect.type === "drainOpponent") {
      const opponent = getOpponent(game, player.playerId);
      opponent.lifeTotal -= effect.amount;
      player.lifeTotal += effect.amount;
      dispatchGameEvent(game, {
        type: "lifeGained",
        playerId: player.playerId,
        sourceId: source.instanceId,
        amount: effect.amount,
      });
    }

    if (effect.type === "addCountersToSource") {
      source.plusOneCounters += effect.amount;
      dispatchGameEvent(game, {
        type: "plusOneCountersAdded",
        playerId: player.playerId,
        sourceId: source.instanceId,
        targetId: source.instanceId,
        amount: effect.amount,
      });
    }

    if (effect.type === "pumpAttackingCreaturesByAttackerCount") {
      const attackingIds = new Set(
        game.events
          .filter((event) => event.turn === game.turnNumber && event.type === "creatureAttacked" && event.playerId === player.playerId)
          .map((event) => event.sourceId)
          .filter((sourceId): sourceId is string => typeof sourceId === "string"),
      );
      const pumpAmount = attackingIds.size;

      for (const creature of player.battlefield.filter((permanent) => attackingIds.has(permanent.instanceId))) {
        creature.powerModifier += pumpAmount;
        creature.toughnessModifier += pumpAmount;
      }
    }

    if (effect.type === "addCounterToTargetAndMaybeFirstStrike" && target) {
      target.plusOneCounters += effect.amount;
      if (hasSubtype(target, effect.subtype)) {
        target.temporaryKeywords.push("First strike");
      }
      dispatchGameEvent(game, {
        type: "plusOneCountersAdded",
        playerId: player.playerId,
        sourceId: source.instanceId,
        targetId: target.instanceId,
        amount: effect.amount,
      });
    }

    if (effect.type === "pumpTarget" && target) {
      target.powerModifier += effect.power;
      target.toughnessModifier += effect.toughness;
      target.temporaryKeywords.push(...(effect.keywords ?? []));
    }

    if (effect.type === "grantUnblockable" && target) {
      target.temporaryKeywords.push("Unblockable");
    }

    if (effect.type === "grantFlyingAndSacrificeOnCombatDamage" && target) {
      target.temporaryKeywords.push("Flying", "SacrificeOnCombatDamage");
    }

    if (effect.type === "becomeWerewolfThenCountersAndDraw") {
      source.plusOneCounters += effect.counters;
      source.additionalSubtypes = Array.from(new Set([...(source.additionalSubtypes ?? []), "Werewolf"]));
      dispatchGameEvent(game, {
        type: "plusOneCountersAdded",
        playerId: player.playerId,
        sourceId: source.instanceId,
        targetId: source.instanceId,
        amount: effect.counters,
      });
      drawCards(game, player, 1);
    }

  if (effect.type === "destroyTargetPermanent" && target) {
      movePermanentToGraveyard(game, target.instanceId);
    }

    if (effect.type === "returnSourceFromGraveyardToBattlefieldTapped") {
      const sourceIndex = player.graveyard.findIndex((card) => card.instanceId === source.instanceId);
      const [returned] = sourceIndex === -1 ? [] : player.graveyard.splice(sourceIndex, 1);

      if (returned) {
        resetForBattlefield(returned, game.turnNumber, true);
        player.battlefield.push(returned);
        dispatchGameEvent(game, {
          type: "creatureEntered",
          playerId: player.playerId,
          sourceId: returned.instanceId,
          details: { cardId: returned.card.id, from: "graveyard", tapped: true },
        });
      }
    }

    if (effect.type === "exileSourceFromGraveyard") {
      const sourceIndex = player.graveyard.findIndex((card) => card.instanceId === source.instanceId);
      const [exiled] = sourceIndex === -1 ? [] : player.graveyard.splice(sourceIndex, 1);

      if (exiled) {
        player.exile.push(exiled);
        dispatchGameEvent(game, {
          type: "permanentExiled",
          playerId: player.playerId,
          sourceId: exiled.instanceId,
          details: { cardId: exiled.card.id, from: "graveyard" },
        });
      }
    }

    if (effect.type === "createToken") {
      createToken(game, player, source, effect);
    }
  }

  game.log.push({
    turn: game.turnNumber,
    phase: game.phase,
    message: `${player.playerId} activates ${source.card.name}.`,
  });
}
