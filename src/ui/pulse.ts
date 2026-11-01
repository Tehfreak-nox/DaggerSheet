// Pressed feedback: a control you actually tap (a click, not a swipe or a
// scroll) briefly shows a pressed-in look so you know it registered.
export function installTapPulse() {
  document.addEventListener('click', (e) => {
    const el = (e.target as Element | null)?.closest?.('button, a, [role="button"], [role="tab"]') as HTMLElement | null;
    if (!el || (el as HTMLButtonElement).disabled) return;
    el.classList.remove('was-pressed');
    void el.offsetWidth;
    el.classList.add('was-pressed');
    setTimeout(() => el.classList.remove('was-pressed'), 180);
  });
}
