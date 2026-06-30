import type { Card, CardInstance, ManaPool, ManaSymbol, PlayerState } from "./types.js";

const MANA_SYMBOLS: ManaSymbol[] = ["W", "U", "B", "R", "G", "C"];
const COLORED_MANA_SYMBOLS: ManaSymbol[] = ["W", "U", "B", "R", "G"];

export interface ManaCost {
  generic: number;
  colored: Partial<Record<ManaSymbol, number>>;
}

export interface ManaAbility {
  permanentId: string;
  mana: ManaSymbol;
  amount: number;
}

export function createEmptyManaPool(): ManaPool {
  return {
    W: 0,
    U: 0,
    B: 0,
    R: 0,
    G: 0,
    C: 0,
  };
}

export function parseManaCost(manaCost: string): ManaCost {
  const parsed: ManaCost = {
    generic: 0,
    colored: {},
  };
  const symbols = manaCost.matchAll(/\{([^}]+)\}/g);

  for (const [, symbol] of symbols) {
    const genericAmount = Number.parseInt(symbol, 10);

    if (Number.isFinite(genericAmount)) {
      parsed.generic += genericAmount;
      continue;
    }

    if (MANA_SYMBOLS.includes(symbol as ManaSymbol)) {
      const manaSymbol = symbol as ManaSymbol;
      parsed.colored[manaSymbol] = (parsed.colored[manaSymbol] ?? 0) + 1;
    }
  }

  return parsed;
}

export function canPayManaCost(pool: ManaPool, manaCost: string): boolean {
  const cost = parseManaCost(manaCost);
  let remainingMana = 0;

  for (const symbol of COLORED_MANA_SYMBOLS) {
    const required = cost.colored[symbol] ?? 0;

    if (pool[symbol] < required) {
      return false;
    }

    remainingMana += pool[symbol] - required;
  }

  remainingMana += pool.C - (cost.colored.C ?? 0);

  return remainingMana >= cost.generic;
}

export function spendManaCost(pool: ManaPool, manaCost: string): ManaPool {
  if (!canPayManaCost(pool, manaCost)) {
    throw new Error(`Cannot pay mana cost ${manaCost}.`);
  }

  const cost = parseManaCost(manaCost);
  const nextPool = { ...pool };

  for (const symbol of MANA_SYMBOLS) {
    const required = cost.colored[symbol] ?? 0;
    nextPool[symbol] -= required;
  }

  let genericToPay = cost.generic;

  for (const symbol of MANA_SYMBOLS) {
    const paid = Math.min(nextPool[symbol], genericToPay);
    nextPool[symbol] -= paid;
    genericToPay -= paid;

    if (genericToPay === 0) {
      break;
    }
  }

  return nextPool;
}

export function addMana(pool: ManaPool, symbol: ManaSymbol, amount: number): ManaPool {
  const nextPool = { ...pool };

  if (MANA_SYMBOLS.includes(symbol) && amount > 0) {
    nextPool[symbol] += amount;
  }

  return nextPool;
}

function hasKeyword(instance: CardInstance, keyword: string): boolean {
  const printedKeywords = instance.losesAbilities ? [] : instance.card.keywords;
  return [...printedKeywords, ...instance.staticKeywords, ...instance.temporaryKeywords].some(
    (candidate) => candidate.toLowerCase() === keyword.toLowerCase(),
  );
}

function isCreature(instance: CardInstance): boolean {
  return instance.card.cardTypes.includes("Creature");
}

function hasSubtype(instance: CardInstance, subtype: string): boolean {
  return new RegExp(`\\b${subtype}\\b`, "i").test(instance.card.typeLine) || (instance.additionalSubtypes ?? []).includes(subtype);
}

function canActivateTapAbility(instance: CardInstance, turnNumber: number): boolean {
  if (instance.tapped || instance.losesAbilities) {
    return false;
  }

  if (!isCreature(instance)) {
    return true;
  }

  return instance.enteredTurn !== turnNumber || hasKeyword(instance, "Haste");
}

function hasNewHorizonsAttached(player: PlayerState, land: CardInstance): boolean {
  return player.battlefield.some(
    (permanent) => permanent.card.id === "new_horizons" && permanent.attachedToId === land.instanceId,
  );
}

function countSubtype(player: PlayerState, subtype: string): number {
  return player.battlefield.filter((permanent) => hasSubtype(permanent, subtype)).length;
}

export function getManaAbility(player: PlayerState, permanent: CardInstance, turnNumber: number): ManaAbility | null {
  if (!canActivateTapAbility(permanent, turnNumber)) {
    return null;
  }

  if (permanent.card.isLand && permanent.card.landMana && MANA_SYMBOLS.includes(permanent.card.landMana as ManaSymbol)) {
    return {
      permanentId: permanent.instanceId,
      mana: permanent.card.landMana as ManaSymbol,
      amount: hasNewHorizonsAttached(player, permanent) ? 2 : 1,
    };
  }

  if (permanent.card.id === "llanowar_elves" || permanent.card.id === "druid_of_the_cowl") {
    return { permanentId: permanent.instanceId, mana: "G", amount: 1 };
  }

  if (permanent.card.id === "elvish_archdruid") {
    return { permanentId: permanent.instanceId, mana: "G", amount: countSubtype(player, "Elf") };
  }

  if (permanent.card.id === "carnelian_orb_of_dragonkind") {
    return { permanentId: permanent.instanceId, mana: "R", amount: 1 };
  }

  return null;
}

export function getManaAbilities(player: PlayerState, turnNumber: number): ManaAbility[] {
  return player.battlefield
    .map((permanent) => getManaAbility(player, permanent, turnNumber))
    .filter((ability): ability is ManaAbility => ability !== null && ability.amount > 0);
}

export function addManaFromLand(pool: ManaPool, card: Card): ManaPool {
  if (!card.isLand || !card.landMana) {
    return pool;
  }

  return addMana(pool, card.landMana as ManaSymbol, 1);
}

export function produceManaFromBattlefield(player: PlayerState): ManaPool {
  return player.battlefield.reduce((pool, instance) => {
    const ability = getManaAbility(player, instance, Number.POSITIVE_INFINITY);
    return ability ? addMana(pool, ability.mana, ability.amount) : pool;
  }, createEmptyManaPool());
}

export function totalMana(pool: ManaPool): number {
  return MANA_SYMBOLS.reduce((total, symbol) => total + pool[symbol], 0);
}
