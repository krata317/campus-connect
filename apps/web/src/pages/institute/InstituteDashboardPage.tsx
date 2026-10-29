import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BellRing, ClipboardCheck, GraduationCap, Send, Wrench } from 'lucide-react';
import type { InstituteStats } from '@campusconnect/shared';
import { api, errorMessage } from '@/lib/api';
import { useCurrentUser } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, LoadingState, PageHeader } from '@/components/ui/feedback';
import { cn } from '@/lib/utils';

const statCards = [
  { key: 'students', label: 'Students', icon: GraduationCap, to: '/institute/students' },
  { key: 'requestsAwaitingReview', label: 'Awaiting review', icon: ClipboardCheck, to: '/institute/requests' },
  { key: 'approvedRequests', label: 'Approved requests', icon: Send, to: '/institute/requests' },
  { key: 'notificationsSent', label: 'Notifications sent', icon: BellRing, to: '/institute/dispatches' },
] as const;

export const InstituteDashboardPage = () => {
  const stats = useQuery({ queryKey: ['institute', 'stats'], queryFn: () => api.get<InstituteStats>('/institute/stats') });
  const { user } = useCurrentUser();

  if (stats.isLoading) return <LoadingState label="Loading placement overview" />;
  if (stats.isError) return <ErrorState message={errorMessage(stats.error)} onRetry={() => stats.refetch()} />;

  const data = stats.data as InstituteStats;

  const setupSteps = [
    {
      title: 'Build the skill catalogue',
      body: 'Students and recruiters can only choose skills you have created. Add the subjects this institute actually teaches.',
      done: data.skills > 0,
      to: '/institute/skills',
      cta: 'Manage skills',
    },
    {
      title: 'Share the student code',
      body: 'Students need your institute code to register. It is in your welcome email and in settings.',
      done: data.students > 0,
      to: '/institute/settings',
      cta: 'Open settings',
    },
    {
      title: 'Review hiring requests',
      body: 'Approve, reject, or return a request with a note. Only approved requests can be shortlisted.',
      done: data.approvedRequests > 0,
      to: '/institute/requests',
      cta: 'Open requests',
    },
    {
      title: 'Dispatch a shortlist',
      body: 'Open a role, check eligibility against real student records, choose students and confirm the dispatch.',
      done: data.dispatches > 0,
      to: '/institute/dispatches',
      cta: 'Dispatch history',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={user?.institute?.name ?? 'Placement overview'}
        description={
          user?.institute
            ? `AISHE ${user.institute.aisheCode} · ${user.institute.district}, ${user.institute.state}`
            : 'Live counts for your institute.'
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Link
            key={card.key}
            to={card.to}
            className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.label}</span>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-2 text-2xl font-semibold text-foreground">{data[card.key]}</p>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Getting your institute ready</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {setupSteps.map((step, index) => (
            <div
              key={step.title}
              className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex gap-3">
                <span
                  className={cn(
                    'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    step.done ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {step.done ? '✓' : index + 1}
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">{step.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                </div>
              </div>
              <Link
                to={step.to}
                className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                {step.cta}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Catalogue</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-semibold text-foreground">{data.skills}</p>
              <p className="text-sm text-muted-foreground">skills available to students</p>
            </div>
            <Link to="/institute/skills" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
              <Wrench className="h-3.5 w-3.5" />
              Manage
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Placement activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Dispatched roles</span>
              <Badge variant="outline">{data.dispatches}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Notifications delivered</span>
              <Badge variant="outline">{data.notificationsSent}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Students registered</span>
              <Badge variant="outline">{data.students}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
