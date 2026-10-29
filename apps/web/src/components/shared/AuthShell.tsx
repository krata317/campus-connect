import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';

/** Shared frame for sign-in, registration and password pages. */
export const AuthShell = ({
  title,
  subtitle,
  children,
  footer,
  wide,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) => (
  <div className="mx-auto w-full px-4 py-12 sm:px-6 lg:py-16">
    <div className={wide ? 'mx-auto w-full max-w-2xl' : 'mx-auto w-full max-w-md'}>
      <div className="mb-6 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <Link to="/" className="text-sm font-semibold tracking-tight text-foreground">
          Campus Connect
        </Link>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-card sm:p-7">
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {subtitle ? <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </div>

      {footer ? <div className="mt-5 text-center text-sm text-muted-foreground">{footer}</div> : null}
    </div>
  </div>
);
