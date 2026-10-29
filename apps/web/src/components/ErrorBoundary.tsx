import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defence against a blank screen.
 *
 * React unmounts the whole tree when a component throws during render, which is
 * what a single wrong field name used to do here. Catching it keeps the rest of
 * the application usable and tells the person what happened instead of showing
 * an empty white page.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Kept in the browser console so the detail is available without a server log.
    console.error('Unhandled render error', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-foreground">Something went wrong on this page</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            The rest of Campus Connect is unaffected. Reload the page to try again — if it keeps happening, send this
            message to your placement cell.
          </p>
          <p className="mt-3 break-words rounded-md border border-border bg-muted/50 px-3 py-2 text-left font-mono text-xs text-muted-foreground">
            {error.message}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Reload page
            </button>
            <a
              href="/"
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Go to homepage
            </a>
          </div>
        </div>
      </div>
    );
  }
}
