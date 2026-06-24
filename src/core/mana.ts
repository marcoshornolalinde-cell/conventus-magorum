import type { Card, ManaPool, ManaSymbol, PlayerState } from "./types.js";

const MANA_SYMBOLS: ManaSymbol[] = ["W", "U", "B", "R", "G", "C"];
const COLORED_MANA_SYMBOLS: ManaSymbol[] = ["W", "U", "B", "R", "G"];

export interface ManaCost {
  generic: number;
  colored: Partial<Record<ManaSymbol, number>>;
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

export function addManaFromLand(pool: ManaPool, card: Card): ManaPool {
  if (!card.isLand || !card.landMana) {
    return pool;
  }

  const nextPool = { ...pool };
  const symbol = card.landMana as ManaSymbol;

  if (MANA_SYMBOLS.includes(symbol)) {
    nextPool[symbol] += 1;
  }

  return nextPool;
}

export function produceManaFromBattlefield(player: PlayerState): ManaPool {
  return player.battlefield.reduce(
    (pool, instance) => addManaFromLand(pool, instance.card),
    createEmptyManaPool(),
  );
}

export function totalMana(pool: ManaPool): number {
  return MANA_SYMBOLS.reduce((total, symbol) => total + pool[symbol], 0);
}
