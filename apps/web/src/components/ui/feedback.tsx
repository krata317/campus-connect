import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, Loader2, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

const tones = {
  info: { wrapper: 'border-border bg-muted text-foreground', Icon: Info },
  success: { wrapper: 'border-success/30 bg-success/10 text-success', Icon: CheckCircle2 },
  warning: { wrapper: 'border-warning/30 bg-warning/10 text-warning', Icon: TriangleAlert },
  error: { wrapper: 'border-destructive/30 bg-destructive/10 text-destructive', Icon: AlertCircle },
} as const;

export const Alert = ({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: keyof typeof tones;
  title?: string;
  children?: ReactNode;
  className?: string;
}) => {
  const { wrapper, Icon } = tones[tone];
  return (
    <div className={cn('flex gap-3 rounded-md border px-4 py-3 text-sm', wrapper, className)} role="status">
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className="text-sm opacity-90">{children}</div> : null}
      </div>
    </div>
  );
};

export const Spinner = ({ className }: { className?: string }) => <Loader2 className={cn('h-4 w-4 animate-spin', className)} />;

export const LoadingState = ({ label = 'Loading' }: { label?: string }) => (
  <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
    <Spinner />
    {label}
  </div>
);

export const EmptyState = ({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) => (
  <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
    {icon ? <div className="text-muted-foreground">{icon}</div> : null}
    <div className="space-y-1">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description ? <p className="mx-auto max-w-md text-sm text-muted-foreground">{description}</p> : null}
    </div>
    {action}
  </div>
);

export const PageHeader = ({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div className="space-y-1">
      <h1 className="text-xl font-semibold sm:text-2xl">{title}</h1>
      {description ? <p className="max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
    </div>
    {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
  </div>
);

export const ErrorState = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
    <p>{message}</p>
    {onRetry ? (
      <button type="button" onClick={onRetry} className="mt-2 font-medium underline underline-offset-2">
        Try again
      </button>
    ) : null}
  </div>
);
