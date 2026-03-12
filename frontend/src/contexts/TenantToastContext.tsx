'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (type: ToastType, title: string, message?: string, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toasts: [],
  addToast: () => {},
  removeToast: () => {},
});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((type: ToastType, title: string, message?: string, duration = 5000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts(prev => [...prev, { id, type, title, message }]);
    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
}

const TOAST_STYLES: Record<ToastType, { bg: string; icon: string; iconBg: string }> = {
  success: { bg: 'bg-emerald-50 border-emerald-200 text-emerald-800', icon: '✓', iconBg: 'bg-emerald-500' },
  error:   { bg: 'bg-red-50 border-red-200 text-red-800',           icon: '✕', iconBg: 'bg-red-500' },
  warning: { bg: 'bg-amber-50 border-amber-200 text-amber-800',     icon: '⚠', iconBg: 'bg-amber-500' },
  info:    { bg: 'bg-cyan-50 border-cyan-200 text-cyan-800',        icon: 'ℹ', iconBg: 'bg-cyan-500' },
};

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
      {toasts.map(toast => {
        const style = TOAST_STYLES[toast.type];
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto animate-slide-down border rounded-xl shadow-lg p-4 flex items-start gap-3 ${style.bg}`}
          >
            <div className={`w-6 h-6 rounded-full ${style.iconBg} text-white flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5`}>
              {style.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{toast.title}</p>
              {toast.message && <p className="text-sm mt-0.5 opacity-80">{toast.message}</p>}
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              className="text-current opacity-50 hover:opacity-100 flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
