import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BellRing, BookOpen, Briefcase, UserRound } from 'lucide-react';
import type { StudentDashboard } from '@campusconnect/shared';
import { api, errorMessage } from '@/lib/api';
import { dashboardQueryKey } from '@/hooks/useStudent';
import { useCurrentUser } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui/feedback';
import { NotificationItem } from '@/components/student/NotificationItem';
import { cn, scoreText } from '@/lib/utils';

export const StudentDashboardPage = () => {
  const dashboard = useQuery({
    queryKey: dashboardQueryKey,
    queryFn: () => api.get<StudentDashboard>('/student/me/dashboard'),
  });
  const { user } = useCurrentUser();

  if (dashboard.isLoading) return <LoadingState label="Loading your dashboard" />;
  if (dashboard.isError) return <ErrorState message={errorMessage(dashboard.error)} onRetry={() => dashboard.refetch()} />;

  const data = dashboard.data as StudentDashboard;
  const undergrad = data.profile.education.find((item) => item.level === 'UNDERGRAD');
  const class10 = data.profile.education.find((item) => item.level === 'CLASS_10');
  const class12 = data.profile.education.find((item) => item.level === 'CLASS_12');

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${data.profile.fullName.split(' ')[0]}`}
        description={
          user?.institute
            ? `${user.institute.name} · keep your profile accurate — the placement cell evaluates these records when a recruiter submits a hiring request.`
            : 'Keep your profile accurate — the placement cell evaluates these records when a recruiter submits a hiring request.'
        }
        actions={
          <Link to="/student/profile" className={cn(buttonVariants())}>
            Edit profile
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Profile completion</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end justify-between">
              <p className="text-3xl font-semibold text-foreground">{data.completion.percent}%</p>
              <p className="text-sm text-muted-foreground">
                {data.completion.completed} of {data.completion.total} details recorded
              </p>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${data.completion.percent}%` }} />
            </div>
            {data.completion.missing.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Still missing</p>
                <div className="flex flex-wrap gap-1.5">
                  {data.completion.missing.map((item) => (
                    <Badge key={item} variant="secondary">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-success">Every profile detail is filled in.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-semibold text-foreground">{data.unreadNotifications}</p>
              <p className="text-sm text-muted-foreground">unread</p>
            </div>
            <p className="text-sm text-muted-foreground">{data.totalNotifications} notification(s) received in total.</p>
            <Link to="/student/notifications" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full')}>
              View all notifications
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3">
              <UserRound className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="text-sm">
                <p className="font-medium text-foreground">{data.profile.fullName}</p>
                <p className="text-muted-foreground">
                  {data.profile.email}
                  {data.profile.phone ? ` · ${data.profile.phone}` : ''}
                </p>
                <p className="text-muted-foreground">
                  {[data.profile.city, data.profile.state].filter(Boolean).join(', ') || 'Location not provided'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <BookOpen className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="text-sm">
                <p className="font-medium text-foreground">
                  {undergrad ? `${undergrad.degree}, ${undergrad.branch}` : 'Undergraduate details not added'}
                </p>
                <p className="text-muted-foreground">
                  {undergrad
                    ? `${undergrad.institution ?? 'Institution not set'} · ${scoreText(undergrad.scoreType, undergrad.scoreValue, undergrad.scoreScale)} · ${undergrad.passingYear ?? '—'}`
                    : 'Required for most placement eligibility checks'}
                </p>
                <p className="text-muted-foreground">
                  Class 10 {class10 ? scoreText(class10.scoreType, class10.scoreValue, class10.scoreScale) : '—'} · Class 12{' '}
                  {class12 ? scoreText(class12.scoreType, class12.scoreValue, class12.scoreScale) : '—'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Briefcase className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="text-sm">
                <p className="font-medium text-foreground">
                  {data.profile.skills.length} skill(s) · {data.profile.experiences.length} experience record(s)
                </p>
                <p className="text-muted-foreground">
                  Active backlogs: {data.profile.activeBacklogs === null ? 'not reported' : data.profile.activeBacklogs}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent notifications</CardTitle>
            <Link to="/student/notifications" className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline">
              See all
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.recentNotifications.length === 0 ? (
              <EmptyState
                icon={<BellRing className="h-6 w-6" />}
                title="No notifications yet"
                description="When the placement cell finalises a shortlist that includes you, the notification appears here."
              />
            ) : (
              data.recentNotifications.map((notification) => <NotificationItem key={notification.id} notification={notification} />)
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
