import type { ReviewEvent } from '@campusconnect/shared';
import { formatDateTime, statusLabel } from '@/lib/utils';

const actionLabel = (action: string): string =>
  ({
    REQUEST_SUBMITTED: 'Submitted for review',
    REQUEST_APPROVED: 'Approved',
    REQUEST_REJECTED: 'Rejected',
    REQUEST_CHANGES_REQUESTED: 'Changes requested',
    EMPLOYER_APPROVED: 'Employer approved',
    EMPLOYER_REJECTED: 'Employer rejected',
  })[action] ?? action;

export const ReviewHistory = ({ events }: { events: ReviewEvent[] }) => {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No review activity recorded yet.</p>;
  }

  return (
    <ol className="space-y-3">
      {events.map((event) => (
        <li key={event.id} className="relative border-l border-border pl-4">
          <span className="absolute -left-[3px] top-1.5 h-1.5 w-1.5 rounded-full bg-navy-500" />
          <p className="text-sm font-medium text-navy-900">{actionLabel(event.action)}</p>
          <p className="text-xs text-muted-foreground">
            {event.fromStatus ? `${statusLabel(event.fromStatus)} → ` : ''}
            {statusLabel(event.toStatus)} · {event.actorRole === 'ADMIN' ? 'Placement cell' : 'Employer'} ·{' '}
            {formatDateTime(event.at)}
          </p>
          {event.note ? <p className="mt-1 text-sm text-navy-700">{event.note}</p> : null}
        </li>
      ))}
    </ol>
  );
};
