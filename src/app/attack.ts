// Weapon and Beastform attacks, shared by the Equipment page and by features
// that say "make an attack".
import { activeForm, attackProfile, derive, type AttackProfile, type Modifier } from '../rules';
import { signed } from '../ui/kit';
import { actionRoll, damage, setCrit, type DamageOptions } from './play';
import { getCharacter } from './store';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Roll damage for a weapon slot; `off` lists situational modifiers switched off on the Equipment page. */
export function weaponDamage(id: string, slot: 'primary' | 'secondary', o: DamageOptions = {}, off: Record<string, boolean> = {}) {
  const ch = getCharacter(id);
  const a = ch && attackProfile(ch, slot);
  if (!ch || !a) return;
  // Equipped secondary-weapon bonuses (Paired, Focused) are part of the weapon's damage.
  const bonus = a.damageBonus + a.conditional.filter((m: Modifier) => !off[m.source + m.condition]).reduce((s, m) => s + m.value, 0);
  const dice = o.halfProf ? a.dice.map((x) => ({ ...x, count: Math.max(1, Math.ceil(x.count / 2)) })) : a.dice;
  const text = `${dice.map((x) => `${x.count}d${x.sides}`).join('+')}${bonus ? signed(bonus) : ''} ${a.damageType}`;
  damage(`Damage · ${a.name}`, {
    dice, bonus, critical: !!o.critical, extraDieDropLowest: a.extraDieDropLowest,
  }, `${text}${o.critical ? ' · critical' : ''}${o.halfProf ? ' · half Proficiency' : ''}`, [], { charId: id, magic: a.damageType === 'mag', attack: true });
  setCrit(id, false);
}

export function weaponAttack(id: string, slot: 'primary' | 'secondary', sub?: string, off: Record<string, boolean> = {}) {
  const ch = getCharacter(id);
  const a: AttackProfile | null = ch ? attackProfile(ch, slot) : null;
  if (!ch || !a) return false;
  const hit = [{ label: cap(a.trait), value: a.traitValue }, ...a.attackModifiers];
  const total = hit.reduce((s, m) => s + m.value, 0);
  actionRoll(id, `Attack · ${a.name}`, hit, sub ?? `2d12 ${signed(total)}`, { attack: true, trait: a.trait, damageFn: (o) => weaponDamage(id, slot, o, off) });
  return true;
}

export function beastDamage(id: string, o: DamageOptions = {}) {
  const ch = getCharacter(id);
  const f = ch && activeForm(ch);
  if (!ch || !f?.attack) return;
  const d = derive(ch);
  const at = f.attack;
  const count = o.halfProf ? Math.max(1, Math.ceil(d.proficiency / 2)) : d.proficiency;
  const bonus = at.bonus + d.modifiers.filter((m) => m.stat === 'damage' && !m.condition).reduce((s, m) => s + m.value, 0);
  damage(`Damage · ${f.name}`, { dice: [{ count, sides: at.sides }], bonus, critical: !!o.critical },
    `${count}d${at.sides}${bonus ? `+${bonus}` : ''} ${at.type}${o.critical ? ' · critical' : ''}`, [], { charId: id, magic: at.type === 'mag', attack: true });
  setCrit(id, false);
}

export function beastAttack(id: string) {
  const ch = getCharacter(id);
  const f = ch && activeForm(ch);
  if (!ch || !f?.attack) return false;
  const v = derive(ch).traits[f.attack.trait];
  actionRoll(id, `Attack · ${f.name}`, [{ label: cap(f.attack.trait), value: v }], `2d12 ${signed(v)}`, { attack: true, trait: f.attack.trait, damageFn: (o) => beastDamage(id, o) });
  return true;
}

/** "Make an attack": your Beastform's attack while transformed, else your primary (or only) weapon. */
export function attackNow(id: string, primaryOnly = false): boolean {
  const ch = getCharacter(id);
  if (!ch) return false;
  if (ch.beastform && beastAttack(id)) return true;
  if (weaponAttack(id, 'primary')) return true;
  return !primaryOnly && weaponAttack(id, 'secondary');
}
