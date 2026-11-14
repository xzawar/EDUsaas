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
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={cx(
              'pointer-events-auto flex max-w-md items-start gap-2.5 rounded-2xl px-4 py-3.5 text-[15px] leading-6',
              t.tone === 'success' ? 'bg-ink text-white' : 'bg-ink text-white',
            )}
          >
            {t.tone === 'success' ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-accent" />
            ) : (
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[#ffbfba]" />
            )}
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
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-2 sm:items-center sm:p-4"
      onMouseDown={onClose}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
        className={cx(
          'relative flex max-h-[92vh] w-full flex-col rounded-3xl bg-white pt-4',
          size === 'md' ? 'sm:max-w-lg' : 'sm:max-w-3xl',
        )}
      >
        <span aria-hidden className="absolute top-2 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full bg-line sm:hidden" />
        <header className="flex items-start justify-between gap-4 px-6 pt-3 pb-2">
          <div>
            <h2 id={titleId} className="t-section-title">
              {title}
            </h2>
            {description && <p className="mt-2 t-body">{description}</p>}
          </div>
          <button
            data-close
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-tint text-primary hover:bg-tint-strong"
          >
            <X className="size-5" />
          </button>
        </header>
        <div className="overflow-y-auto px-6 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 px-6 pt-2 pb-6">{footer}</footer>}
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
    <div className="fixed inset-0 z-40 bg-ink/40" onMouseDown={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute inset-y-2 right-2 flex w-[calc(100%-1rem)] max-w-md flex-col rounded-3xl bg-white"
      >
        <header className="flex items-center justify-between gap-4 px-6 pt-6 pb-2">
          <h2 id={titleId} className="t-section-title">
            {title}
          </h2>
          <button
            data-close
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-tint text-primary hover:bg-tint-strong"
          >
            <X className="size-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-line px-6 py-4">{footer}</footer>}
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
        <div className="space-y-3 text-[15px] leading-6 text-secondary">{message}</div>
        {requireText !== undefined && (
          <label className="mt-4 block text-sm">
            <span className="text-slate-600">
              Type <strong className="font-mono">{requireText}</strong> to confirm
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="mt-2 block h-11 w-full rounded-md border border-line px-3.5 text-[15px] text-primary focus:border-deep focus:ring-2 focus:ring-deep/15 focus:outline-none"
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
    for (const d of details as { path?: string; message?: string }[])
      if (d.path && d.message && !out[d.path]) out[d.path] = d.message;
  } else if (details && typeof details === 'object' && 'field' in details) {
    out[String((details as { field: string }).field)] = error!.message;
  }
  return out;
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-[13px] text-negative">{message}</p>;
}
