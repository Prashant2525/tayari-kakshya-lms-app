import type { ReactNode } from 'react';

/** Shared look (DESIGN_SYSTEM): buttons, cards, alerts, fields — Tailwind classes over the design tokens. */

export const button = {
  primary:
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-[15px] font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60',
  secondary:
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border-strong bg-surface px-5 py-2.5 text-[15px] font-semibold text-text transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60',
  link: 'font-medium text-link underline-offset-2 hover:underline',
};

export const input =
  'h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-[15px] text-text placeholder:text-text-muted focus:border-primary focus:outline-none aria-[invalid=true]:border-danger';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-border bg-surface p-5 shadow-e1 ${className}`}>{children}</div>
  );
}

export function Alert({
  tone = 'danger',
  children,
}: {
  tone?: 'danger' | 'success' | 'info';
  children: ReactNode;
}) {
  const cls = {
    danger: 'bg-danger-soft text-danger',
    success: 'bg-success-soft text-success',
    info: 'bg-primary-soft text-on-primary-soft',
  }[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`rounded-md px-4 py-3 text-sm font-medium ${cls}`}
    >
      {children}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-text">{label}</span>
      {children}
      {hint ? <span className="text-xs text-text-muted">{hint}</span> : null}
    </label>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-3xl font-bold leading-tight tracking-tight text-text">{children}</h1>
      {sub ? <p className="mt-2 text-text-secondary">{sub}</p> : null}
    </div>
  );
}

export function Chip({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'success' | 'premium' | 'primary';
  children: ReactNode;
}) {
  const cls = {
    neutral: 'bg-surface-muted text-text-secondary',
    success: 'bg-success-soft text-success',
    premium: 'bg-premium text-on-premium',
    primary: 'bg-primary-soft text-on-primary-soft',
  }[tone];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {children}
    </span>
  );
}
