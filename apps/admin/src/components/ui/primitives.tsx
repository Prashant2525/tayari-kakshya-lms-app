import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, Inbox, Loader2, RefreshCw } from 'lucide-react';
import { Checkbox as RadixCheckbox, Switch as RadixSwitch } from 'radix-ui';
import type { HTMLAttributes, ReactNode } from 'react';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from './button';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-md border border-border bg-surface shadow-e1', className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  actions,
  className,
  titleId,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** Lets a surrounding <section aria-labelledby> name itself after this heading. */
  titleId?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 id={titleId} className="text-[17px] font-semibold leading-6 text-text">
          {title}
        </h2>
        {description ? <p className="mt-0.5 text-sm text-text-secondary">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', {
  variants: {
    tone: {
      neutral: 'bg-surface-muted text-text-secondary',
      primary: 'bg-primary-soft text-on-primary-soft',
      success: 'bg-success-soft text-success',
      warning: 'bg-warning-soft text-warning',
      danger: 'bg-danger-soft text-danger',
      premium: 'bg-premium text-on-premium',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export function Badge({
  tone,
  className,
  children,
}: VariantProps<typeof badgeVariants> & { className?: string; children: ReactNode }) {
  return <span className={cn(badgeVariants({ tone }), className)}>{children}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-sm bg-surface-muted', className)} aria-hidden />;
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-text-muted" role="status">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="mb-1 grid size-12 place-items-center rounded-full bg-surface-muted text-text-muted">
        <Inbox className="size-6" aria-hidden />
      </div>
      <p className="font-semibold text-text">{title}</p>
      {description ? <p className="max-w-md text-sm text-text-secondary">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center" role="alert">
      <div className="mb-1 grid size-12 place-items-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle className="size-6" aria-hidden />
      </div>
      <p className="font-semibold text-text">Could not load this data</p>
      <p className="max-w-md text-sm text-text-secondary">{errorMessage(error)}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-2">
          <RefreshCw /> Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Alert({
  tone = 'warning',
  title,
  children,
}: {
  tone?: 'warning' | 'danger' | 'primary' | 'success';
  title: string;
  children?: ReactNode;
}) {
  const tones = {
    warning: 'border-warning/30 bg-warning-soft text-warning',
    danger: 'border-danger/30 bg-danger-soft text-danger',
    primary: 'border-primary/25 bg-primary-soft text-on-primary-soft',
    success: 'border-success/30 bg-success-soft text-success',
  };
  return (
    <div
      className={cn('rounded-sm border px-4 py-3', tones[tone])}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <p className="text-sm font-semibold">{title}</p>
      {children ? <div className="mt-1 text-sm text-text-secondary">{children}</div> : null}
    </div>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  id,
  disabled,
  label,
}: {
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  id?: string;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <RadixSwitch.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={label}
      className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-border-strong transition-colors duration-150 data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
    >
      <RadixSwitch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow-e1 transition-transform duration-150 data-[state=checked]:translate-x-[22px]" />
    </RadixSwitch.Root>
  );
}

export function Checkbox({
  checked,
  onCheckedChange,
  id,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <RadixCheckbox.Root
      id={id}
      checked={checked}
      onCheckedChange={(v) => onCheckedChange(v === true)}
      disabled={disabled}
      className="grid size-[18px] shrink-0 place-items-center rounded-[5px] border border-border-strong bg-surface data-[state=checked]:border-primary data-[state=checked]:bg-primary disabled:opacity-50"
    >
      <RadixCheckbox.Indicator className="text-on-primary">
        <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
          <path
            d="M2.5 6.2 5 8.5l4.5-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[26px] font-bold leading-8 tracking-tight text-text">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-[15px] text-text-secondary">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return (
    <span
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-[13px] font-bold text-on-primary-soft',
        className,
      )}
      aria-hidden
    >
      {letters || '?'}
    </span>
  );
}
