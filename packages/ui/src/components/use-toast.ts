import { useState, createContext, useContext } from 'react';

type ToastVariant = 'default' | 'destructive' | 'success';

interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  toast: (props: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    // Return a mock implementation if context is not available
    return {
      toast: (props: Omit<Toast, 'id'>) => {
        console.log('Toast:', props);
      },
      toasts: [],
      dismiss: (id: string) => {
        console.log('Dismiss toast:', id);
      }
    };
  }
  return context;
}