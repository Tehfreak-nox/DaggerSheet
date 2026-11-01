// Gold: 10 coins = 1 handful, 10 handfuls = 1 bag, 10 bags = 1 chest; max 1 chest carried.
import type { Gold } from './model';

export const DENOMS = ['coins', 'handfuls', 'bags', 'chests'] as const;
export type Denom = (typeof DENOMS)[number];

/** Slots per row on the sheet. */
export const ROW_SLOTS: Record<Denom, number> = { coins: 10, handfuls: 10, bags: 10, chests: 1 };

/** Can one more unit be carried into `denom` (directly or by rolling over)? */

function addOne(g: Gold, i: number): Gold | null {
  const d = DENOMS[i];
  if (d === 'chests') return g.chests < ROW_SLOTS.chests ? { ...g, chests: g.chests + 1 } : null;
  if (g[d] + 1 < ROW_SLOTS[d]) return { ...g, [d]: g[d] + 1 };
  // Filling the last slot rolls into the next row and clears this one…
  const rolled = addOne({ ...g, [d]: 0 }, i + 1);
  if (rolled) return rolled;
  // …unless every higher row is full: then the row stays maxed.
  return g[d] < ROW_SLOTS[d] ? { ...g, [d]: g[d] + 1 } : null;
}

/** Add `n` of a denomination. Returns the new gold and how many units didn't fit. */
export function addGold(g: Gold, denom: Denom, n = 1): { gold: Gold; overflow: number } {
  let cur = g;
  for (let k = 0; k < n; k++) {
    const next = addOne(cur, DENOMS.indexOf(denom));
    if (!next) return { gold: cur, overflow: n - k };
    cur = next;
  }
  return { gold: cur, overflow: 0 };
}

/** Remove `n` of a denomination, breaking a larger one if needed. Returns null if you can't afford it. */
export function removeGold(g: Gold, denom: Denom, n = 1): Gold | null {
  let cur: Gold = { ...g };
  for (let k = 0; k < n; k++) {
    const i = DENOMS.indexOf(denom);
    if (cur[denom] > 0) {
      cur = { ...cur, [denom]: cur[denom] - 1 };
      continue;
    }
    // Break the nearest larger denomination: 1 bag -> 9 handfuls (after spending one), etc.
    let j = i + 1;
    while (j < DENOMS.length && cur[DENOMS[j]] === 0) j++;
    if (j >= DENOMS.length) return null;
    cur = { ...cur, [DENOMS[j]]: cur[DENOMS[j]] - 1 };
    for (let x = j - 1; x > i; x--) cur = { ...cur, [DENOMS[x]]: cur[DENOMS[x]] + 9 };
    cur = { ...cur, [denom]: cur[denom] + 9 };
  }
  return cur;
}

export function totalCoins(g: Gold): number {
  return g.coins + g.handfuls * 10 + g.bags * 100 + g.chests * 1000;
}

/** The safe has no limit and no rollover. */
export function store(carried: Gold, safe: Gold, denom: Denom, n = 1): { carried: Gold; safe: Gold } | null {
  const c = removeGold(carried, denom, n);
  if (!c) return null;
  return { carried: c, safe: { ...safe, [denom]: safe[denom] + n } };
}

export function take(carried: Gold, safe: Gold, denom: Denom, n = 1): { carried: Gold; safe: Gold; overflow: number } | null {
  if (safe[denom] < n) return null;
  const { gold, overflow } = addGold(carried, denom, n);
  return { carried: gold, safe: { ...safe, [denom]: safe[denom] - n + overflow }, overflow };
}
