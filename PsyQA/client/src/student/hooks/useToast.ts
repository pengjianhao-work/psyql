import { useCallback, useState } from 'react';
import { ToastMessage } from '../../components/Toast';

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback(
    (text: string, tone: ToastMessage['tone'] = 'info', action?: { label: string; onClick: () => void }) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [
        ...prev,
        {
          id,
          text,
          tone,
          actionLabel: action?.label,
          onAction: action?.onClick
        }
      ]);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, pushToast, dismissToast };
}
