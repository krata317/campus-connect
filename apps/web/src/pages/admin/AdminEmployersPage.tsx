import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Check, Search, X } from 'lucide-react';
import type { EmployerApprovalStatus, EmployerCompany, ReviewEvent } from '@campusconnect/shared';
import { api, errorMessage } from '@/lib/api';
import { Alert, EmptyState, ErrorState, LoadingState, PageHeader, Spinner } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ReviewHistory } from '@/components/shared/ReviewHistory';
import { formatDate, statusLabel, statusTone } from '@/lib/utils';

type EmployerDetail = EmployerCompany & { reviewEvents: ReviewEvent[] };

const filters: { value: EmployerApprovalStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
];

export const AdminEmployersPage = () => {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<EmployerApprovalStatus | 'ALL'>('PENDING');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [reviewTarget, setReviewTarget] = useState<{ employer: EmployerDetail; action: 'APPROVE' | 'REJECT' } | null>(null);
  const [note, setNote] = useState('');

  const employers = useQuery({
    queryKey: ['admin', 'employers', status, query],
    queryFn: () => {
      const params = new URLSearchParams();
      if (status !== 'ALL') params.set('status', status);
      if (query) params.set('q', query);
      return api.get<{ items: EmployerDetail[] }>(`/admin/employers?${params.toString()}`).then((response) => response.items);
    },
  });

  const review = useMutation({
    mutationFn: (input: { id: string; action: 'APPROVE' | 'REJECT'; note: string | null }) =>
      api.post<EmployerDetail>(`/admin/employers/${input.id}/review`, { action: input.action, note: input.note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      setReviewTarget(null);
      setNote('');
    },
  });

  if (employers.isError) return <ErrorState message={errorMessage(employers.error)} onRetry={() => employers.refetch()} />;

  const items = employers.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Recruiter approvals"
        description="Only approved recruiters can submit hiring requests. Rejecting an account blocks request creation but keeps the record for audit."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-lg border border-border bg-white p-1">
          {filters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setStatus(filter.value)}
              className={
                status === filter.value
                  ? 'rounded-md bg-navy-900 px-3 py-1.5 text-sm font-medium text-white'
                  : 'rounded-md px-3 py-1.5 text-sm font-medium text-navy-600 hover:bg-navy-50'
              }
            >
              {filter.label}
            </button>
          ))}
        </div>

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(search.trim());
          }}
        >
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Company or email" className="pl-8" />
          </div>
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
      </div>

      {review.isError ? <Alert tone="error">{errorMessage(review.error)}</Alert> : null}

      {employers.isLoading ? (
        <LoadingState label="Loading recruiters" />
      ) : items.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<Building2 className="h-6 w-6" />}
              title="No recruiter accounts here"
              description="Recruiters appear here after registering through the public recruiter registration page."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((employer) => (
            <Card key={employer.account.id}>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold text-navy-900">{employer.company.name}</h2>
                      <Badge variant={statusTone(employer.account.approvalStatus)}>{statusLabel(employer.account.approvalStatus)}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {employer.company.contactPersonName} · {employer.company.contactPhone} · {employer.company.contactEmail}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Account: {employer.account.email} · registered {formatDate(employer.company.createdAt)}
                      {employer.company.website ? ` · ${employer.company.website}` : ''}
                    </p>
                    {employer.company.description ? (
                      <p className="max-w-2xl pt-1 text-sm text-navy-700">{employer.company.description}</p>
                    ) : null}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={employer.account.approvalStatus === 'APPROVED'}
                      onClick={() => {
                        setReviewTarget({ employer, action: 'APPROVE' });
                        setNote('');
                      }}
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      disabled={employer.account.approvalStatus === 'REJECTED'}
                      onClick={() => {
                        setReviewTarget({ employer, action: 'REJECT' });
                        setNote('');
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                      Reject
                    </Button>
                  </div>
                </div>

                {employer.reviewEvents.length > 0 ? (
                  <details className="rounded-md border border-border bg-muted/40 p-3">
                    <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Review history ({employer.reviewEvents.length})
                    </summary>
                    <div className="pt-3">
                      <ReviewHistory events={employer.reviewEvents} />
                    </div>
                  </details>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={Boolean(reviewTarget)} onOpenChange={(open) => (open ? undefined : setReviewTarget(null))}>
        <DialogContent
          title={reviewTarget?.action === 'APPROVE' ? 'Approve employer' : 'Reject employer'}
          description={
            reviewTarget?.action === 'APPROVE'
              ? `${reviewTarget?.employer.company.name} will be able to submit hiring requests.`
              : `${reviewTarget?.employer.company.name} will not be able to submit hiring requests. A note is required.`
          }
        >
          <div className="space-y-4">
            <Field label="Note for the recruiter" htmlFor="reviewNote" hint={reviewTarget?.action === 'REJECT' ? 'Required' : 'Optional'}>
              <Textarea id="reviewNote" rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReviewTarget(null)}>
                Cancel
              </Button>
              <Button
                variant={reviewTarget?.action === 'REJECT' ? 'destructive' : 'default'}
                disabled={review.isPending || (reviewTarget?.action === 'REJECT' && note.trim().length === 0)}
                onClick={() => {
                  if (!reviewTarget) return;
                  review.mutate({ id: reviewTarget.employer.account.id, action: reviewTarget.action, note: note.trim() || null });
                }}
              >
                {review.isPending ? <Spinner /> : null}
                {reviewTarget?.action === 'APPROVE' ? 'Approve account' : 'Reject account'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
