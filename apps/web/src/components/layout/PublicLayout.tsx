import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useCurrentUser } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const links = [
  { to: '/register/institute', label: 'For institutes' },
  { to: '/register/recruiter', label: 'For recruiters' },
  { to: '/register/student', label: 'For students' },
];

export const PublicLayout = ({ children }: { children: ReactNode }) => {
  const { user } = useCurrentUser();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 focus-visible:outline-none">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold tracking-tight text-foreground">Campus Connect</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Registration options">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            {user ? (
              <Link
                to={user.role === 'STUDENT' ? '/student' : user.role === 'RECRUITER' ? '/recruiter' : '/institute'}
                className={cn(buttonVariants({ size: 'sm' }))}
              >
                Open dashboard
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="hidden rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent sm:inline-flex"
                >
                  Sign in
                </Link>
                <Link to="/register/student" className={cn(buttonVariants({ size: 'sm' }))}>
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} Campus Connect · Campus placements for students, recruiters and institutes.</p>
          <div className="flex flex-wrap items-center gap-4">
            <Link to="/register/institute" className="hover:text-foreground">
              Register an institute
            </Link>
            <Link to="/register/recruiter" className="hover:text-foreground">
              Register as a recruiter
            </Link>
            <Link to="/login" className="hover:text-foreground">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};
