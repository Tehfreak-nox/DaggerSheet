// One shared character store for every screen, saved locally and (when the
// page runs as a claude.ai artifact with a signed-in owner) to the viewer's
// private per-user data, so phone and PC see the same characters.
import { useSyncExternalStore } from 'react';
import { armorById, lootById, weaponById } from '../data';
import type { Character } from '../rules';

/** Make a character's homebrew gear resolvable by id everywhere (engine and UI). */
function registerHomebrew(ch: Character) {
  for (const w of ch.homebrew?.weapons ?? []) weaponById.set(w.id, w);
  for (const a of ch.homebrew?.armor ?? []) armorById.set(a.id, a);
  for (const l of ch.homebrew?.items ?? []) lootById.set(l.id, l);
}

const LOCAL_KEY = 'daggersheet:v1:characters';

type Listener = () => void;

interface State {
  characters: Record<string, Character>;
  /** 'local' until account sync is confirmed. */
  sync: 'local' | 'connecting' | 'account' | 'error';
}

let state: State = { characters: loadLocal(), sync: 'local' };
Object.values(state.characters).forEach(registerHomebrew);
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

function setState(next: Partial<State>) {
  state = { ...state, ...next };
  emit();
}

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => select(state),
  );
}

export function getCharacter(id: string): Character | undefined {
  return state.characters[id];
}

export function listCharacters(): Character[] {
  return Object.values(state.characters).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

/** Replace a character (stamped with updatedAt) and save it. */
export function saveCharacter(ch: Character) {
  registerHomebrew(ch);
  const stamped = { ...ch, updatedAt: Date.now() };
  setState({ characters: { ...state.characters, [ch.id]: stamped } });
  saveLocal();
  cloud?.schedule(stamped);
}

export function updateCharacter(id: string, fn: (c: Character) => Character) {
  const cur = state.characters[id];
  if (!cur) return;
  saveCharacter(fn(cur));
}

export function deleteCharacter(id: string) {
  const { [id]: _gone, ...rest } = state.characters;
  void _gone;
  setState({ characters: rest });
  saveLocal();
  cloud?.remove(id);
}

// ---------- local storage ----------

function loadLocal(): Record<string, Character> {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Character>) : {};
  } catch {
    return {};
  }
}

function saveLocal() {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(state.characters));
  } catch {
    // Storage blocked (private window, preview): the session keeps working in memory.
  }
}

// ---------- account sync (claude.ai artifact `db` + `user`) ----------

interface DocRef {
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}
interface CollectionRef {
  doc(id: string): DocRef;
  get(): Promise<{ docs: { id: string; exists: boolean; data(): Record<string, unknown> | undefined }[] }>;
}
interface Db { collection(path: string): CollectionRef }
interface User { id(): Promise<string | null> }
interface ClaudeRuntime { use(name: string): Promise<unknown> }

class Cloud {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private inflight = new Map<string, Promise<void>>();
  constructor(private col: CollectionRef) {}

  schedule(ch: Character) {
    clearTimeout(this.timers.get(ch.id));
    this.timers.set(ch.id, setTimeout(() => void this.write(ch.id), 800));
  }

  private async write(id: string) {
    // One write at a time per document; always write the latest state.
    await this.inflight.get(id);
    const ch = state.characters[id];
    if (!ch) return;
    const p = this.col.doc(docId(id)).set({ character: JSON.stringify(ch), updatedAt: ch.updatedAt ?? 0 })
      .catch(() => setState({ sync: 'error' }));
    this.inflight.set(id, p);
    await p;
  }

  async remove(id: string) {
    clearTimeout(this.timers.get(id));
    await this.inflight.get(id);
    await this.col.doc(docId(id)).delete().catch(() => setState({ sync: 'error' }));
  }

  async pull() {
    const snap = await this.col.get();
    const merged = { ...state.characters };
    for (const d of snap.docs) {
      if (!d.exists) continue;
      try {
        const remote = JSON.parse(String(d.data()?.character)) as Character;
        const local = merged[remote.id];
        if (!local || (remote.updatedAt ?? 0) > (local.updatedAt ?? 0)) { registerHomebrew(remote); merged[remote.id] = remote; }
      } catch {
        // Skip a damaged document rather than losing the rest.
      }
    }
    setState({ characters: merged });
    saveLocal();
    // Push characters that only exist on this device.
    const remoteIds = new Set(snap.docs.map((d) => d.id));
    for (const ch of Object.values(merged)) if (!remoteIds.has(docId(ch.id))) this.schedule(ch);
  }
}

const docId = (id: string) => id.replace(/[^A-Za-z0-9_.~:@+-]/g, '_').slice(0, 180);

let cloud: Cloud | null = null;

export async function connectAccount() {
  const claude = (window as unknown as { claude?: ClaudeRuntime }).claude;
  if (!claude?.use) return;
  setState({ sync: 'connecting' });
  try {
    const [db, user] = (await Promise.all([claude.use('db'), claude.use('user')])) as [Db | null, User | null];
    const uid = db && user ? await user.id() : null;
    if (!db || !uid) { setState({ sync: 'local' }); return; }
    cloud = new Cloud(db.collection(`data/users/${uid}`));
    await cloud.pull();
    setState({ sync: 'account' });
  } catch {
    cloud = null;
    setState({ sync: 'error' });
  }
}

// ---------- export / import ----------

export function exportJson(ids?: string[]): string {
  const chars = (ids ?? Object.keys(state.characters)).map((id) => state.characters[id]).filter(Boolean);
  return JSON.stringify({ app: 'daggersheet', version: 1, characters: chars }, null, 2);
}

export function importJson(text: string): { imported: number; error?: string } {
  try {
    const data = JSON.parse(text) as { characters?: Character[] } | Character;
    const list = 'characters' in data && Array.isArray(data.characters) ? data.characters : [data as Character];
    let n = 0;
    for (const ch of list) {
      if (!ch || typeof ch !== 'object' || !ch.id || !ch.classId) continue;
      saveCharacter(ch);
      n++;
    }
    return n ? { imported: n } : { imported: 0, error: 'No characters found in that text.' };
  } catch {
    return { imported: 0, error: 'That isn’t valid character JSON.' };
  }
}
