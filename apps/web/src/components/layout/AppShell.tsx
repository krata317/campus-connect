import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { LogOut, ShieldCheck } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { meQueryKey, useCurrentUser } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

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
  const queryClient = useQueryClient();

  const logout = useMutation({
    mutationFn: () => api.post<void>('/auth/logout'),
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(meQueryKey, null);
      window.location.assign('/login');
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-navy-800 bg-navy-900 lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-navy-100 text-navy-900">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">CampusConnect</p>
            <p className="truncate text-xs text-navy-300">{user?.college?.name ?? roleLabel}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive ? 'bg-navy-800 text-white' : 'text-navy-200 hover:bg-navy-800/60 hover:text-white',
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-navy-800 px-4 py-4">
          <p className="truncate text-sm font-medium text-white">{user?.displayName}</p>
          <p className="truncate text-xs text-navy-300">{user?.email}</p>
          <button
            type="button"
            onClick={() => logout.mutate()}
            className="mt-3 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-navy-200 transition-colors hover:bg-navy-800 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-border bg-white/95 backdrop-blur">
          <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
            <Link to="/" className="flex items-center gap-2 lg:hidden">
              <ShieldCheck className="h-5 w-5 text-navy-800" />
              <span className="text-sm font-semibold text-navy-900">CampusConnect</span>
            </Link>
            <div className="hidden min-w-0 items-center gap-2 lg:flex">
              <Badge variant="info">{roleLabel}</Badge>
              {user?.college ? <span className="truncate text-sm font-medium text-navy-800">{user.college.name}</span> : null}
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-muted-foreground sm:inline">{user?.displayName}</span>
              <Button variant="outline" size="sm" onClick={() => logout.mutate()} className="lg:hidden">
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </Button>
            </div>
          </div>
          <div className="flex gap-1 overflow-x-auto border-t border-border px-3 py-2 lg:hidden">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    isActive ? 'bg-navy-800 text-white' : 'text-navy-600 hover:bg-navy-50',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
};
