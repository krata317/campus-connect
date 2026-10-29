import { ExternalLink } from 'lucide-react';
import type { NotificationRecord } from '@campusconnect/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

export const NotificationItem = ({
  notification,
  onMarkRead,
  busy,
}: {
  notification: NotificationRecord;
  onMarkRead?: (id: string) => void;
  busy?: boolean;
}) => {
  const unread = !notification.readAt;

  return (
    <article className={cn('rounded-lg border bg-card p-4', unread ? 'border-primary/40 shadow-card' : 'border-border')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{notification.title}</h3>
            {unread ? <Badge variant="warning">Unread</Badge> : <Badge variant="outline">Read</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            {notification.recruiterName} · {notification.roleTitle} · {formatDateTime(notification.createdAt)}
          </p>
        </div>
        <a
          href={notification.registrationUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 rounded-md border border-input bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
        >
          Registration link
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-foreground">{notification.message}</p>

      {unread && onMarkRead ? (
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={() => onMarkRead(notification.id)} disabled={busy}>
            Mark as read
          </Button>
        </div>
      ) : null}
    </article>
  );
};
