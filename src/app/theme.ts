// Light / dark mode. Default follows the system (or the claude.ai viewer's
// theme); the toggle pins one and remembers it on this device.
const KEY = 'daggersheet:v1:mode';

export type Mode = 'light' | 'dark';

export function effectiveMode(): Mode {
  const root = document.documentElement;
  const pinned = root.dataset.mode;
  if (pinned === 'light' || pinned === 'dark') return pinned;
  const host = root.getAttribute('data-theme');
  if (host === 'light' || host === 'dark') return host;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function loadMode() {
  try {
    const m = localStorage.getItem(KEY);
    if (m === 'light' || m === 'dark') document.documentElement.dataset.mode = m;
  } catch {
    // storage blocked: follow the system
  }
}

export function toggleMode(): Mode {
  const next: Mode = effectiveMode() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.mode = next;
  try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  return next;
}
