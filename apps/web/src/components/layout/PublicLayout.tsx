import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const PublicLayout = ({ children }: { children: ReactNode }) => (
  <div className="flex min-h-screen flex-col bg-background">
    <header className="border-b border-border bg-white">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-navy-900 text-white">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold tracking-tight text-navy-900">CampusConnect</span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link
            to="/login"
            className="hidden rounded-md px-3 py-2 text-sm font-medium text-navy-700 transition-colors hover:bg-navy-50 sm:inline-flex"
          >
            Sign in
          </Link>
          <Link to="/register/student" className={cn(buttonVariants({ size: 'sm' }))}>
            Create student account
          </Link>
        </nav>
      </div>
    </header>

    <div className="flex-1">{children}</div>

    <footer className="border-t border-border bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>CampusConnect — college placement management portal.</p>
        <p>Data is stored in Neo4j on your machine.</p>
      </div>
    </footer>
  </div>
);
