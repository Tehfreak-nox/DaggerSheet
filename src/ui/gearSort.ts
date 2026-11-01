import type { TraitId } from '../data';

/**
 * Order gear for pickers: suggested items first, then weapons whose trait is
 * your strongest (highest modifier first), then everything else in book order.
 */
export function sortGear<T extends { id: string; name: string; trait?: TraitId | 'spellcast' }>(
  items: T[],
  isRec: (x: T) => boolean,
  traits?: Partial<Record<TraitId, number>>,
  spellcast?: number | null,
): T[] {
  const value = (x: T) => {
    if (!x.trait || !traits) return 0;
    if (x.trait === 'spellcast') return spellcast ?? -9;
    return traits[x.trait] ?? 0;
  };
  return items
    .map((x, i) => ({ x, i }))
    .sort((a, b) => Number(isRec(b.x)) - Number(isRec(a.x)) || value(b.x) - value(a.x) || a.i - b.i)
    .map(({ x }) => x);
}
