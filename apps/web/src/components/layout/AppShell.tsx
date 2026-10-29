import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { LogOut, Menu, Settings, ShieldCheck, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useCurrentUser, useLogout } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900',
    isActive
      ? 'bg-white/12 text-white'
      : 'text-navy-200/80 hover:bg-white/8 hover:text-white dark:text-muted-foreground dark:hover:bg-white/5 dark:hover:text-foreground',
  );

const settingsPath = (role: string | undefined): string => {
  if (role === 'STUDENT') return '/student/settings';
  if (role === 'RECRUITER') return '/recruiter/settings';
  return '/institute/settings';
};

export const AppShell = ({
  roleLabel,
  navItems,
  children,
}: {
  roleLabel: string;
  navItems: NavItem[];
  children: ReactNode;
}) => {
  const { user } = useCurrentUser();
  const logout = useLogout();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const subtitle = user?.institute?.name ?? user?.displayName ?? roleLabel;

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {navItems.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
          <item.icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-full bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-navy-800 bg-navy-900 dark:border-border dark:bg-card lg:flex">
        <Link to="/" className="flex items-center gap-2.5 px-5 py-5 focus-visible:outline-none">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10 text-white">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-white">Campus Connect</span>
            <span className="block truncate text-xs text-navy-300 dark:text-muted-foreground">{roleLabel}</span>
          </span>
        </Link>
        {nav}
        <div className="border-t border-navy-800 px-3 py-3 dark:border-border">
          <NavLink to={settingsPath(user?.role)} className={navLinkClass}>
            <Settings className="h-4 w-4 shrink-0" />
            Settings
          </NavLink>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-navy-900 dark:bg-card">
            <div className="flex items-center justify-between px-5 py-4">
              <span className="text-sm font-semibold text-white">Campus Connect</span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
                className="rounded-md p-1.5 text-navy-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {nav}
            <div className="border-t border-navy-800 px-3 py-3 dark:border-border">
              <NavLink to={settingsPath(user?.role)} className={navLinkClass}>
                <Settings className="h-4 w-4 shrink-0" />
                Settings
              </NavLink>
            </div>
          </div>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              className="rounded-md border border-border p-2 text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{subtitle}</p>
            </div>

            <div className="hidden items-center gap-2 sm:flex">
              <Badge variant="outline">{roleLabel}</Badge>
            </div>

            <ThemeToggle />

            <button
              type="button"
              onClick={() => logout.mutate()}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
};
