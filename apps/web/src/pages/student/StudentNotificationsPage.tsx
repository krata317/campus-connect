import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing } from 'lucide-react';
import type { NotificationRecord } from '@campusconnect/shared';
import { api, errorMessage } from '@/lib/api';
import { dashboardQueryKey, notificationsQueryKey } from '@/hooks/useStudent';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui/feedback';
import { NotificationItem } from '@/components/student/NotificationItem';

interface NotificationPage {
  items: NotificationRecord[];
  total: number;
  page: number;
  pageSize: number;
  unread: number;
}

const PAGE_SIZE = 10;

export const StudentNotificationsPage = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const notifications = useQuery({
    queryKey: [...notificationsQueryKey, page],
    queryFn: () => api.get<NotificationPage>(`/students/me/notifications?page=${page}&pageSize=${PAGE_SIZE}`),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post<{ ok: boolean }>(`/students/me/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
      queryClient.invalidateQueries({ queryKey: dashboardQueryKey });
    },
  });

  if (notifications.isLoading) return <LoadingState label="Loading notifications" />;
  if (notifications.isError) return <ErrorState message={errorMessage(notifications.error)} onRetry={() => notifications.refetch()} />;

  const data = notifications.data as NotificationPage;
  const visible = filter === 'unread' ? data.items.filter((item) => !item.readAt) : data.items;
  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Placement notifications"
        description="Notifications are created only when the placement cell confirms a shortlist for a specific role."
        actions={<Badge variant={data.unread > 0 ? 'warning' : 'outline'}>{data.unread} unread</Badge>}
      />

      <div className="flex gap-1 rounded-lg border border-border bg-white p-1">
        {(['all', 'unread'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={
              filter === value
                ? 'rounded-md bg-navy-900 px-3 py-1.5 text-sm font-medium text-white'
                : 'rounded-md px-3 py-1.5 text-sm font-medium text-navy-600 hover:bg-navy-50'
            }
          >
            {value === 'all' ? 'All notifications' : 'Unread only'}
          </button>
        ))}
      </div>

      {markRead.isError ? <Alert tone="error">{errorMessage(markRead.error)}</Alert> : null}

      {data.total === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<BellRing className="h-6 w-6" />}
              title="No notifications yet"
              description="You will see a notification here once the placement cell shortlists you for a role and confirms the dispatch."
            />
          </CardContent>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState title="Nothing unread" description="Every notification on this page has already been read." />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onMarkRead={(id) => markRead.mutate(id)}
              busy={markRead.isPending}
            />
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} · {data.total} total
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
