'use client';

import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { api, type ApiError } from '@/client/api';
import { Button, cx } from '@/components/ui';

// ── Toasts ──────────────────────────────────────────────────────────────────

type Toast = { id: number; tone: 'success' | 'error'; text: string };
const ToastContext = createContext<(tone: Toast['tone'], text: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast['tone'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 7000 : 4000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={cx(
              'pointer-events-auto flex max-w-md items-start gap-2 rounded-lg px-4 py-3 text-sm shadow-lg ring-1',
              t.tone === 'success' ? 'bg-slate-900 text-white ring-slate-900' : 'bg-red-50 text-red-900 ring-red-200',
            )}
          >
            {t.tone === 'success' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/**
 * Runs an API mutation with consistent UX: busy state, success toast, error toast, then refreshes server data.
 * Returns the data on success, or null on failure.
 */
export function useAction() {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const run = useCallback(
    async <T,>(path: string, init: { method?: string; body?: unknown }, success?: string): Promise<T | null> => {
      setBusy(true);
      setError(null);
      const res = await api<T>(path, init);
      setBusy(false);
      if (!res.ok) {
        setError(res.error);
        toast('error', res.error.message);
        return null;
      }
      if (success) toast('success', success);
      router.refresh();
      return res.data;
    },
    [router, toast],
  );
  return { run, busy, error, clearError: () => setError(null) };
}

// ── Dialogs ─────────────────────────────────────────────────────────────────

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
}

function useFocusFirst(open: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const el = ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])');
    el?.focus();
  }, [open]);
  return ref;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}) {
  useEscape(open, onClose);
  const ref = useFocusFirst(open);
  const titleId = useId();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
        className={cx(
          'flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl',
          size === 'md' ? 'sm:max-w-lg' : 'sm:max-w-3xl',
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          <button data-close type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="size-5" />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEscape(open, onClose);
  const ref = useFocusFirst(open);
  const titleId = useId();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 bg-slate-900/40" onMouseDown={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-xl"
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          <button data-close type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="size-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

/** A button that asks for confirmation before running a risky action. */
export function ConfirmButton({
  label,
  title,
  message,
  confirmLabel = 'Confirm',
  tone = 'danger',
  variant = 'secondary',
  size = 'md',
  onConfirm,
  requireText,
}: {
  label: ReactNode;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  variant?: 'secondary' | 'danger-ghost' | 'ghost' | 'primary';
  size?: 'sm' | 'md';
  onConfirm: () => Promise<unknown>;
  /** If set, the user must type this text to enable the confirm button (for irreversible bulk actions). */
  requireText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState('');
  const close = () => {
    setOpen(false);
    setTyped('');
  };
  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal
        open={open}
        onClose={close}
        title={title}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              variant={tone === 'danger' ? 'danger' : 'primary'}
              disabled={busy || (requireText !== undefined && typed.trim() !== requireText)}
              onClick={async () => {
                setBusy(true);
                await onConfirm();
                setBusy(false);
                close();
              }}
            >
              {busy ? 'Working…' : confirmLabel}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-slate-700">{message}</div>
        {requireText !== undefined && (
          <label className="mt-4 block text-sm">
            <span className="text-slate-600">
              Type <strong className="font-mono">{requireText}</strong> to confirm
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        )}
      </Modal>
    </>
  );
}

/** Maps field-level validation details from the API onto a form. */
export function fieldErrors(error: ApiError | null): Record<string, string> {
  const out: Record<string, string> = {};
  const details = error?.details;
  if (Array.isArray(details)) {
    for (const d of details as { path?: string; message?: string }[]) if (d.path && d.message && !out[d.path]) out[d.path] = d.message;
  } else if (details && typeof details === 'object' && 'field' in details) {
    out[String((details as { field: string }).field)] = error!.message;
  }
  return out;
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-red-700">{message}</p>;
}
