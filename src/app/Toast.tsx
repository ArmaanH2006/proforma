import { useEffect, useState } from 'react';
import { useStore } from '../state/store';

export function Toast() {
  const toast = useStore((s) => s.toast);
  const [hiddenId, setHiddenId] = useState<number | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setHiddenId(toast.id), 2800);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast || hiddenId === toast.id) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      {toast.text}
    </div>
  );
}
