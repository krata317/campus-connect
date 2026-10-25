import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BellRing, Building2, ClipboardCheck, GraduationCap, ListChecks } from 'lucide-react';
import type { AdminStats } from '@campusconnect/shared';
import { api, errorMessage } from '@/lib/api';
import { useCurrentUser } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, LoadingState, PageHeader } from '@/components/ui/feedback';
import { cn } from '@/lib/utils';

const statCards = [
  { key: 'students', label: 'Students', icon: GraduationCap, to: '/admin/students' },
  { key: 'pendingEmployers', label: 'Recruiters awaiting approval', icon: Building2, to: '/admin/employers' },
  { key: 'requestsAwaitingReview', label: 'Requests awaiting review', icon: ClipboardCheck, to: '/admin/requests' },
  { key: 'notificationsSent', label: 'Notifications sent', icon: BellRing, to: '/admin/dispatches' },
] as const;

export const AdminDashboardPage = () => {
  const stats = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => api.get<AdminStats>('/admin/stats') });
  const { user } = useCurrentUser();

  if (stats.isLoading) return <LoadingState label="Loading placement overview" />;
  if (stats.isError) return <ErrorState message={errorMessage(stats.error)} onRetry={() => stats.refetch()} />;

  const data = stats.data as AdminStats;

  const setupSteps = [
    {
      title: 'Build the skill catalogue',
      body: 'Students and recruiters can only choose skills you have created. Add the skills this college actually teaches.',
      done: data.skills > 0,
      to: '/admin/skills',
      cta: 'Manage skills',
    },
    {
      title: 'Approve recruiter accounts',
      body: 'Recruiters stay read-only until you approve them. Review the company details before granting access.',
      done: data.approvedEmployers > 0,
      to: '/admin/employers',
      cta: 'Review recruiters',
    },
    {
      title: 'Review hiring requests',
      body: 'Approve, reject or return a request with a note. Only approved requests can be shortlisted.',
      done: data.approvedRequests > 0,
      to: '/admin/requests',
      cta: 'Open requests',
    },
    {
      title: 'Dispatch a shortlist',
      body: 'Open a role, check eligibility against real student data, choose students and confirm the dispatch.',
      done: data.dispatches > 0,
      to: '/admin/dispatches',
      cta: 'Dispatch history',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={user?.college?.name ?? 'Placement overview'}
        description="Live counts for your college only. Nothing on this page is pre-filled sample data."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Link key={card.key} to={card.to} className="group">
            <Card className="h-full transition-colors group-hover:border-navy-300">
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <card.icon className="h-4 w-4 text-navy-500" />
                  <ArrowRight className="h-3.5 w-3.5 text-navy-300 transition-transform group-hover:translate-x-0.5" />
                </div>
                <p className="text-2xl font-semibold text-navy-900">{data[card.key]}</p>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Placement cell checklist</CardTitle>
            <p className="text-sm text-muted-foreground">Steps are marked done once the database contains real records.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {setupSteps.map((step) => (
              <div key={step.title} className="flex items-start gap-3 rounded-md border border-border p-3">
                <span
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                    step.done ? 'bg-emerald-100 text-emerald-700' : 'bg-navy-100 text-navy-600',
                  )}
                >
                  {step.done ? '✓' : '•'}
                </span>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium text-navy-900">{step.title}</p>
                  <p className="text-sm text-muted-foreground">{step.body}</p>
                </div>
                <Link to={step.to} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'shrink-0')}>
                  {step.cta}
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Operational status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border border-border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Skill catalogue</p>
                <p className="mt-1 text-lg font-semibold text-navy-900">{data.skills}</p>
                <Badge variant={data.skills > 0 ? 'success' : 'warning'}>{data.skills > 0 ? 'Ready' : 'Empty'}</Badge>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Approved recruiters</p>
                <p className="mt-1 text-lg font-semibold text-navy-900">{data.approvedEmployers}</p>
                <Badge variant={data.approvedEmployers > 0 ? 'success' : 'warning'}>
                  {data.approvedEmployers > 0 ? 'Ready' : 'None yet'}
                </Badge>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Approved requests</p>
                <p className="mt-1 text-lg font-semibold text-navy-900">{data.approvedRequests}</p>
                <Badge variant={data.approvedRequests > 0 ? 'success' : 'warning'}>
                  {data.approvedRequests > 0 ? 'Ready to shortlist' : 'None yet'}
                </Badge>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Dispatched roles</p>
                <p className="mt-1 text-lg font-semibold text-navy-900">{data.dispatches}</p>
                <Badge variant={data.dispatches > 0 ? 'success' : 'outline'}>{data.dispatches > 0 ? 'Active' : 'None yet'}</Badge>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-md bg-navy-50 p-3 text-sm text-navy-700">
              <ListChecks className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Students only receive a notification when you confirm a dispatch for a specific role. Nothing is sent
                automatically.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
