// Short confirmation messages ("Added Improved Katana to your inventory").
import { useSyncExternalStore } from 'react';

let current: { id: number; text: string } | null = null;
let seq = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(text: string) {
  current = { id: ++seq, text };
  clearTimeout(timer);
  timer = setTimeout(() => { current = null; emit(); }, 2400);
  emit();
}

export function useToast() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => current);
}
