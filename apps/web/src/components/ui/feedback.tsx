import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, Loader2, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

const tones = {
  info: { wrapper: 'border-navy-200 bg-navy-50 text-navy-800', Icon: Info },
  success: { wrapper: 'border-emerald-200 bg-emerald-50 text-emerald-900', Icon: CheckCircle2 },
  warning: { wrapper: 'border-amber-200 bg-amber-50 text-amber-900', Icon: TriangleAlert },
  error: { wrapper: 'border-red-200 bg-red-50 text-red-900', Icon: AlertCircle },
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
  <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-white px-6 py-12 text-center">
    {icon ? <div className="text-navy-400">{icon}</div> : null}
    <div className="space-y-1">
      <p className="text-sm font-semibold text-navy-900">{title}</p>
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
  <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
    <p>{message}</p>
    {onRetry ? (
      <button type="button" onClick={onRetry} className="mt-2 font-medium underline underline-offset-2">
        Try again
      </button>
    ) : null}
  </div>
);
