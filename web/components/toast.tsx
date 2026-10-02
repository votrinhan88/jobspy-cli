"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export interface ToastOptions {
  message: string;
  kind?: "success" | "error";
  action?: { label: string; onAction: () => void };
}

interface ToastState extends ToastOptions {
  id: number;
}

const TOAST_MS = 8000;

const ToastContext = createContext<(toast: ToastOptions) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(1);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setToast(null);
  }, []);

  const show = useCallback(
    (options: ToastOptions) => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ ...options, id: nextId.current++ });
      timer.current = setTimeout(dismiss, TOAST_MS);
    },
    [dismiss]
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="app-toast-region" aria-live="polite" role="status">
        {toast && (
          <div key={toast.id} className={`app-toast app-toast--${toast.kind ?? "success"}`}>
            <span className="app-toast-message">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="app-toast-action"
                onClick={() => {
                  const action = toast.action!;
                  dismiss();
                  action.onAction();
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button type="button" className="app-toast-close" aria-label="Close message" onClick={dismiss}>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
