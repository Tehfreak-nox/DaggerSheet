// Every tap on a control gets a short pulse so you can see it registered.
export function installTapPulse() {
  document.addEventListener('pointerdown', (e) => {
    const el = (e.target as Element | null)?.closest?.('button, a, [role="button"], [role="tab"]') as HTMLElement | null;
    if (!el || (el as HTMLButtonElement).disabled) return;
    el.classList.remove('tap-pulse');
    // Restart the animation on repeated taps.
    void el.offsetWidth;
    el.classList.add('tap-pulse');
    el.addEventListener('animationend', () => el.classList.remove('tap-pulse'), { once: true });
  }, { passive: true });
}
