import { useEffect, useState } from 'react';

type ToastType = 'info' | 'success' | 'error';
interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

const toastEvent = 'sprintdeck:toast';
let seq = 0;

// Fire a toast from anywhere: toast('Retrospective ended', 'success').
export function toast(message: string, type: ToastType = 'info') {
  seq += 1;
  window.dispatchEvent(new CustomEvent(toastEvent, { detail: { id: seq, message, type } }));
}

// Renders the toast stack. Mount once at the app root.
export function ToastHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    function onToast(e: Event) {
      const detail = (e as CustomEvent).detail as ToastItem;
      setToasts((prev) => [...prev, detail]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== detail.id));
      }, 3200);
    }
    window.addEventListener(toastEvent, onToast);
    return () => window.removeEventListener(toastEvent, onToast);
  }, []);

  function dismiss(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  if (toasts.length === 0) return null;
  return (
    <div className="toast-host">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span className="toast-msg">{t.message}</span>
          <button className="toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
