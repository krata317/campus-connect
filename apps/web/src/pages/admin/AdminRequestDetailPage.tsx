import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Users, X } from 'lucide-react';
import type { HiringRequest } from '@campusconnect/shared';
import { api, errorMessage } from '@/lib/api';
import { useSkillCatalogue } from '@/hooks/useStudent';
import { Alert, ErrorState, LoadingState, PageHeader, Spinner } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Textarea } from '@/components/ui/form';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { CriteriaSummary, RoleMeta } from '@/components/shared/CriteriaSummary';
import { ReviewHistory } from '@/components/shared/ReviewHistory';
import { cn, formatDateTime, statusLabel, statusTone } from '@/lib/utils';

type ReviewAction = 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES';

export const AdminRequestDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const skills = useSkillCatalogue();
  const [action, setAction] = useState<ReviewAction | null>(null);
  const [note, setNote] = useState('');

  const request = useQuery({
    queryKey: ['admin', 'request', id],
    queryFn: () => api.get<{ request: HiringRequest }>(`/admin/requests/${id}`).then((response) => response.request),
  });

  const review = useMutation({
    mutationFn: (input: { action: ReviewAction; note: string | null }) =>
      api.post<{ request: HiringRequest }>(`/admin/requests/${id}/review`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      setAction(null);
      setNote('');
    },
  });

  if (request.isLoading) return <LoadingState label="Loading hiring request" />;
  if (request.isError) return <ErrorState message={errorMessage(request.error)} onRetry={() => request.refetch()} />;

  const data = request.data as HiringRequest;
  const canReview = data.status === 'SUBMITTED';
  const canReject = data.status === 'SUBMITTED' || data.status === 'CHANGES_REQUESTED';

  return (
    <div className="space-y-5">
      <PageHeader
        title={data.title}
        description={`${data.companyName} · submitted ${formatDateTime(data.submittedAt)}`}
        actions={
          <Link to="/admin/requests" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={statusTone(data.status)}>{statusLabel(data.status)}</Badge>
        <span className="text-xs text-muted-foreground">Last updated {formatDateTime(data.updatedAt)}</span>
      </div>

      {data.reviewNote ? (
        <Alert tone={data.status === 'REJECTED' ? 'error' : 'warning'} title="Latest review note">
          {data.reviewNote}
        </Alert>
      ) : null}

      {canReview || canReject ? (
        <Card>
          <CardHeader>
            <CardTitle>Review decision</CardTitle>
            <p className="text-sm text-muted-foreground">
              Approving unlocks candidate filtering and shortlist dispatch for every role in this request.
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              disabled={!canReview}
              onClick={() => {
                setAction('APPROVE');
                setNote('');
              }}
            >
              <Check className="h-4 w-4" />
              Approve request
            </Button>
            <Button
              variant="outline"
              disabled={!canReview}
              onClick={() => {
                setAction('REQUEST_CHANGES');
                setNote('');
              }}
            >
              Request changes
            </Button>
            <Button
              variant="outline"
              className="text-destructive"
              disabled={!canReject}
              onClick={() => {
                setAction('REJECT');
                setNote('');
              }}
            >
              <X className="h-4 w-4" />
              Reject request
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {data.assessmentInstructions ? (
        <Card>
          <CardHeader>
            <CardTitle>Assessment instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line text-sm text-navy-700">{data.assessmentInstructions}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-4">
        {data.roles.map((role, index) => (
          <Card key={role.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>
                  {index + 1}. {role.title}
                </CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusTone(role.status)}>{statusLabel(role.status)}</Badge>
                  {role.shortlistStatus !== 'NONE' ? (
                    <Badge variant="info">
                      {role.shortlistStatus === 'DISPATCHED' ? 'Dispatched' : 'Shortlist draft'} · {role.shortlistedCount}
                    </Badge>
                  ) : null}
                </div>
              </div>
              <RoleMeta location={role.location} employmentType={role.employmentType} />
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="whitespace-pre-line text-sm text-navy-700">{role.description}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Eligibility criteria</p>
                  <CriteriaSummary criteria={role.criteria} skills={skills.data ?? []} />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Registration</p>
                  <a
                    href={role.registrationUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="block break-all text-sm font-medium text-navy-700 hover:underline"
                  >
                    {role.registrationUrl}
                  </a>
                  {role.dispatchedAt ? <p className="text-xs text-muted-foreground">Dispatched {formatDateTime(role.dispatchedAt)}</p> : null}
                  <Link
                    to={`/admin/roles/${role.id}`}
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), data.status !== 'APPROVED' ? 'pointer-events-none opacity-50' : '')}
                  >
                    <Users className="h-3.5 w-3.5" />
                    Candidates & shortlist
                  </Link>
                  {data.status !== 'APPROVED' ? (
                    <p className="text-xs text-muted-foreground">Approve the request to enable candidate filtering.</p>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Review history</CardTitle>
        </CardHeader>
        <CardContent>
          <ReviewHistory events={data.reviewEvents ?? []} />
        </CardContent>
      </Card>

      <Dialog open={Boolean(action)} onOpenChange={(open) => (open ? undefined : setAction(null))}>
        <DialogContent
          title={action === 'APPROVE' ? 'Approve hiring request' : action === 'REJECT' ? 'Reject hiring request' : 'Request changes'}
          description={
            action === 'APPROVE'
              ? 'The employer will see the request as approved and you can start shortlisting.'
              : 'Your note is shown to the employer and stored in the review history.'
          }
        >
          <div className="space-y-4">
            <Field
              label="Note"
              htmlFor="decisionNote"
              hint={action === 'APPROVE' ? 'Optional' : 'Required'}
              error={review.isError ? errorMessage(review.error) : undefined}
            >
              <Textarea id="decisionNote" rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAction(null)}>
                Cancel
              </Button>
              <Button
                variant={action === 'REJECT' ? 'destructive' : 'default'}
                disabled={review.isPending || (action !== 'APPROVE' && note.trim().length === 0)}
                onClick={() => {
                  if (!action) return;
                  review.mutate({ action, note: note.trim() || null });
                }}
              >
                {review.isPending ? <Spinner /> : null}
                Confirm
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
