/** Random source returning a float in [0, 1). Inject a seeded one in tests. */
export type Rng = () => number;

export const defaultRng: Rng = Math.random;

/** Small deterministic PRNG (mulberry32). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function roll(sides: number, rng: Rng = defaultRng): number {
  return 1 + Math.floor(rng() * sides);
}

export function rollMany(count: number, sides: number, rng: Rng = defaultRng): number[] {
  return Array.from({ length: Math.max(0, count) }, () => roll(sides, rng));
}

/** Parse "d8", "2d6+3", "1d4+1", "d10-1". */
export function parseDice(spec: string): { count: number; sides: number; bonus: number } {
  const m = /^(\d*)d(\d+)\s*([+-]\s*\d+)?$/.exec(spec.replace(/−/g, '-').replace(/\s+/g, ''));
  if (!m) throw new Error(`Bad dice spec: ${spec}`);
  return { count: m[1] ? Number(m[1]) : 1, sides: Number(m[2]), bonus: m[3] ? Number(m[3]) : 0 };
}
