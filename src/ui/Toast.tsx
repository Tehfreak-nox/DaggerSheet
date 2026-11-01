import { useToast } from '../app/toast';

export function Toast() {
  const t = useToast();
  return (
    <div className="toast-wrap" aria-live="polite">
      {t && <div key={t.id} className="toast">{t.text}</div>}
    </div>
  );
}
