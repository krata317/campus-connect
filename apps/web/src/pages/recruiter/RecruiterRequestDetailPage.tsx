import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Send, Trash2 } from 'lucide-react';
import { DELETED_ACCOUNT_NOTICE } from '@campusconnect/shared';
import type { HiringRequest } from '@campusconnect/shared';
import { api, errorMessage } from '@/lib/api';
import { useSkillCatalogue } from '@/hooks/useStudent';
import { Alert, ErrorState, LoadingState, PageHeader, Spinner } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CriteriaSummary, RoleMeta } from '@/components/shared/CriteriaSummary';
import { ReviewHistory } from '@/components/shared/ReviewHistory';
import { cn, formatDateTime, statusLabel, statusTone } from '@/lib/utils';

export const RecruiterRequestDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const skills = useSkillCatalogue();

  const request = useQuery({
    queryKey: ['recruiter', 'request', id],
    queryFn: () => api.get<{ request: HiringRequest }>(`/recruiter/requests/${id}`).then((response) => response.request),
  });

  const submit = useMutation({
    mutationFn: () => api.post<{ request: HiringRequest }>(`/recruiter/requests/${id}/submit`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruiter'] });
    },
  });

  const remove = useMutation({
    mutationFn: () => api.delete<void>(`/recruiter/requests/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruiter'] });
      navigate('/recruiter/requests', { replace: true });
    },
  });

  if (request.isLoading) return <LoadingState label="Loading hiring request" />;
  if (request.isError) return <ErrorState message={errorMessage(request.error)} onRetry={() => request.refetch()} />;

  const data = request.data as HiringRequest;
  // A request addressed to a deleted institute is history: it can be read but not changed.
  const editable = !data.instituteDeleted && (data.status === 'DRAFT' || data.status === 'CHANGES_REQUESTED');

  return (
    <div className="space-y-5">
      <PageHeader
        title={data.title}
        description={`${data.recruiterName ?? 'You'} · created ${formatDateTime(data.createdAt)}`}
        actions={
          <>
            <Link to="/recruiter/requests" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Link>
            {editable ? (
              <>
                <Link to={`/recruiter/requests/${data.id}/edit`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Link>
                <Button size="sm" onClick={() => submit.mutate()} disabled={submit.isPending}>
                  {submit.isPending ? <Spinner /> : <Send className="h-3.5 w-3.5" />}
                  Submit for review
                </Button>
              </>
            ) : null}
            {data.status === 'DRAFT' ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm('Delete this draft request and all of its roles? This cannot be undone.')) remove.mutate();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            ) : null}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={statusTone(data.status)}>{statusLabel(data.status)}</Badge>
        <span className="text-xs text-muted-foreground">
          Submitted {formatDateTime(data.submittedAt)} · Reviewed {formatDateTime(data.reviewedAt)}
        </span>
      </div>

      {data.instituteDeleted ? (
        <Alert tone="info" title="Read-only history">
          {DELETED_ACCOUNT_NOTICE.INSTITUTE} This request stays in your records but can no longer be edited or submitted.
        </Alert>
      ) : null}

      {data.reviewNote ? (
        <Alert tone={data.status === 'REJECTED' ? 'error' : 'warning'} title={data.status === 'REJECTED' ? 'Rejection note' : 'Note from the placement cell'}>
          {data.reviewNote}
        </Alert>
      ) : null}

      {submit.isError ? <Alert tone="error">{errorMessage(submit.error)}</Alert> : null}
      {remove.isError ? <Alert tone="error">{errorMessage(remove.error)}</Alert> : null}

      {data.assessmentInstructions ? (
        <Card>
          <CardHeader>
            <CardTitle>Assessment instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line text-sm text-foreground">{data.assessmentInstructions}</p>
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
                <div className="flex items-center gap-2">
                  <Badge variant={statusTone(role.status)}>{statusLabel(role.status)}</Badge>
                  {role.shortlistStatus !== 'NONE' ? (
                    <Badge variant="info">
                      {role.shortlistStatus === 'DISPATCHED' ? 'Shortlist dispatched' : 'Shortlist drafted'} · {role.shortlistedCount}
                    </Badge>
                  ) : null}
                </div>
              </div>
              <RoleMeta location={role.location} employmentType={role.employmentType} />
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="whitespace-pre-line text-sm text-foreground">{role.description}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Eligibility criteria</p>
                  <CriteriaSummary criteria={role.criteria} skills={skills.data ?? []} />
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Registration</p>
                  <a
                    href={role.registrationUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="break-all text-sm font-medium text-foreground hover:underline"
                  >
                    {role.registrationUrl}
                  </a>
                  {role.dispatchedAt ? (
                    <p className="mt-2 text-xs text-muted-foreground">Dispatched {formatDateTime(role.dispatchedAt)}</p>
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
    </div>
  );
};
