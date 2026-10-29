import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, Send, Users, XCircle } from 'lucide-react';
import type { CandidateEvaluation, EligibilityCheck, JobRole } from '@campusconnect/shared';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useSkillCatalogue } from '@/hooks/useStudent';
import { Alert, EmptyState, ErrorState, LoadingState, PageHeader, Spinner } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox, Field, Textarea } from '@/components/ui/form';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { CriteriaSummary } from '@/components/shared/CriteriaSummary';
import { cn, formatMonths, scoreText } from '@/lib/utils';

interface CandidateResponse {
  role: JobRole;
  request: { id: string; title: string; status: string; assessmentInstructions: string | null };
  company: { id: string; name: string };
  candidates: CandidateEvaluation[];
  totalStudents: number;
  eligibleCount: number;
  shortlistCount: number;
}

interface ShortlistEntry {
  studentId: string;
  fullName: string;
  email: string;
  status: string;
  shortlistedAt: string | null;
  dispatchedAt: string | null;
  notificationId: string | null;
  readAt: string | null;
}

const checkTone = (status: EligibilityCheck['status']): string => {
  if (status === 'PASS') return 'text-success';
  if (status === 'FAIL') return 'text-destructive';
  if (status === 'MISSING') return 'text-warning';
  return 'text-muted-foreground';
};

const checkLabel = (status: EligibilityCheck['status']): string =>
  ({ PASS: 'Met', FAIL: 'Not met', MISSING: 'Unverified', SKIPPED: 'Not required' })[status];

export const InstituteRoleCandidatesPage = () => {
  const { roleId } = useParams<{ roleId: string }>();
  const queryClient = useQueryClient();
  const skills = useSkillCatalogue();

  const [eligibleOnly, setEligibleOnly] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [message, setMessage] = useState('');

  const candidates = useQuery({
    queryKey: ['institute', 'candidates', roleId, eligibleOnly],
    queryFn: () =>
      api.get<CandidateResponse>(`/institute/roles/${roleId}/candidates?eligibleOnly=${eligibleOnly ? 'true' : 'false'}`),
  });

  const shortlist = useQuery({
    queryKey: ['institute', 'shortlist', roleId],
    queryFn: () => api.get<{ items: ShortlistEntry[] }>(`/institute/roles/${roleId}/shortlist`).then((response) => response.items),
  });

  useEffect(() => {
    if (!shortlist.data) return;
    setSelected(shortlist.data.map((entry) => entry.studentId));
  }, [shortlist.data]);

  const saveShortlist = useMutation({
    mutationFn: () => api.put<{ count: number }>(`/institute/roles/${roleId}/shortlist`, { studentIds: selected }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });

  const dispatch = useMutation({
    mutationFn: () => api.post<{ dispatched: number }>(`/institute/roles/${roleId}/dispatch`, { studentIds: selected, message: message.trim() || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      setDispatchOpen(false);
      setMessage('');
    },
  });

  const data = candidates.data;

  const ineligibleSelected = useMemo(() => {
    if (!data) return [];
    const byId = new Map(data.candidates.map((candidate) => [candidate.studentId, candidate]));
    return selected
      .map((id) => byId.get(id))
      .filter((candidate): candidate is CandidateEvaluation => Boolean(candidate) && candidate?.eligible === false);
  }, [data, selected]);

  if (candidates.isLoading) return <LoadingState label="Evaluating students" />;
  if (candidates.isError) return <ErrorState message={errorMessage(candidates.error)} onRetry={() => candidates.refetch()} />;
  if (!data) return <ErrorState message="Student data is unavailable" onRetry={() => candidates.refetch()} />;

  const dispatched = data.role.shortlistStatus === 'DISPATCHED';
  const requestApproved = data.request.status === 'APPROVED';

  const toggle = (studentId: string) => {
    setSelected((current) => (current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId]));
  };

  const dispatchError = dispatch.error instanceof ApiError ? dispatch.error : null;
  const ineligibleFromServer =
    (dispatchError?.details as { ineligible?: { studentId: string; fullName: string; reasons: string[] }[] } | undefined)?.ineligible ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title={data.role.title}
        description={`${data.company.name} · ${data.request.title}`}
        actions={
          <Link to={`/institute/requests/${data.request.id}`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to request
          </Link>
        }
      />

      {!requestApproved ? (
        <Alert tone="warning" title="This request is not approved">
          Shortlisting is only available for approved requests. Current status: {data.request.status.toLowerCase().replace('_', ' ')}.
        </Alert>
      ) : null}

      {dispatched ? (
        <Alert tone="success" title="Shortlist already dispatched">
          Notifications were sent for this role. The shortlist is locked and cannot be changed. Dispatching again is blocked by
          the server to prevent duplicate notifications.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Eligibility criteria</CardTitle>
          </CardHeader>
          <CardContent>
            <CriteriaSummary criteria={data.role.criteria} skills={skills.data ?? []} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Students evaluated', value: data.totalStudents },
            { label: 'Eligible', value: data.eligibleCount },
            { label: 'Selected', value: selected.length },
            { label: 'Saved shortlist', value: data.shortlistCount },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{stat.label}</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Students</CardTitle>
            <p className="text-sm text-muted-foreground">
              Eligibility is computed from saved profiles. Expand a row to see every criterion result.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox checked={eligibleOnly} onChange={(event) => setEligibleOnly(event.target.checked)} />
            Show eligible students only
          </label>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.candidates.length === 0 ? (
            <EmptyState
              icon={<Users className="h-6 w-6" />}
              title={eligibleOnly ? 'No student currently meets these criteria' : 'No students have registered yet'}
              description={
                eligibleOnly
                  ? 'Turn off the eligible-only filter to inspect why students do not qualify.'
                  : 'Student records appear here once students register and complete their profiles.'
              }
            />
          ) : (
            <div className="divide-y divide-border rounded-md border border-border">
              {data.candidates.map((candidate) => {
                const isSelected = selected.includes(candidate.studentId);
                const isOpen = expanded === candidate.studentId;
                return (
                  <div key={candidate.studentId} className={cn('p-3', isSelected ? 'bg-muted/50' : 'bg-card')}>
                    <div className="flex flex-wrap items-start gap-3">
                      <Checkbox
                        checked={isSelected}
                        onChange={() => toggle(candidate.studentId)}
                        disabled={dispatched || !requestApproved}
                        aria-label={`Select ${candidate.fullName}`}
                        className="mt-1"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">{candidate.fullName}</p>
                          {candidate.eligible ? (
                            <Badge variant="success">
                              <CheckCircle2 className="h-3 w-3" />
                              Eligible
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              <XCircle className="h-3 w-3" />
                              Not eligible
                            </Badge>
                          )}
                          {candidate.shortlistStatus ? (
                            <Badge variant={candidate.shortlistStatus === 'DISPATCHED' ? 'info' : 'secondary'}>
                              {candidate.shortlistStatus === 'DISPATCHED' ? 'Notified' : 'In saved shortlist'}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">{candidate.email}</p>
                        <p className="mt-1 text-xs text-foreground">
                          {candidate.undergrad
                            ? `${candidate.undergrad.degree ?? '—'} · ${candidate.undergrad.branch ?? '—'} · ${scoreText(
                                candidate.undergrad.scoreType,
                                candidate.undergrad.scoreValue,
                                candidate.undergrad.scoreScale,
                              )} · ${candidate.undergrad.passingYear ?? '—'}`
                            : 'Undergraduate details not added'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Backlogs: {candidate.activeBacklogs === null ? 'not reported' : candidate.activeBacklogs} · Experience:{' '}
                          {formatMonths(candidate.experienceMonths)} · Skills: {candidate.skills.length}
                        </p>
                        {candidate.missingSkills.length > 0 ? (
                          <p className="mt-1 text-xs text-destructive">Missing skills: {candidate.missingSkills.join(', ')}</p>
                        ) : null}
                        {candidate.matchedSkills.length > 0 ? (
                          <p className="text-xs text-success">Matched skills: {candidate.matchedSkills.join(', ')}</p>
                        ) : null}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setExpanded(isOpen ? null : candidate.studentId)}>
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        {isOpen ? 'Hide detail' : 'Detail'}
                      </Button>
                    </div>

                    {isOpen ? (
                      <div className="mt-3 space-y-1.5 rounded-md border border-border bg-muted/40 p-3">
                        {candidate.checks.map((check) => (
                          <div key={check.key} className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                            <p className="text-xs font-medium text-foreground">
                              {check.label}
                              <span className="ml-2 font-normal text-muted-foreground">{check.requirement}</span>
                            </p>
                            <p className={cn('text-xs font-medium', checkTone(check.status))}>
                              {checkLabel(check.status)} · {check.observed}
                            </p>
                          </div>
                        ))}
                        {candidate.reasons.length > 0 ? (
                          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-destructive">
                            {candidate.reasons.map((reason) => (
                              <li key={reason}>{reason}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {ineligibleSelected.length > 0 ? (
            <Alert tone="warning" title="Selected students who do not meet the criteria">
              <ul className="list-disc space-y-0.5 pl-4">
                {ineligibleSelected.map((candidate) => (
                  <li key={candidate.studentId}>
                    {candidate.fullName} — {candidate.reasons[0] ?? 'Does not meet the criteria'}
                  </li>
                ))}
              </ul>
              The server re-checks eligibility before dispatch and will reject the dispatch while these students are selected.
            </Alert>
          ) : null}

          {saveShortlist.isError ? <Alert tone="error">{errorMessage(saveShortlist.error)}</Alert> : null}
          {saveShortlist.isSuccess ? <Alert tone="success">Shortlist saved. Nothing has been sent to students yet.</Alert> : null}
          {dispatch.isError ? <Alert tone="error">{errorMessage(dispatch.error)}</Alert> : null}
          {dispatch.isSuccess ? <Alert tone="success">Notifications created for the selected students.</Alert> : null}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">
              Saving a shortlist does not notify anyone. Dispatch creates the notifications.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={dispatched || !requestApproved || saveShortlist.isPending}
                onClick={() => saveShortlist.mutate()}
              >
                {saveShortlist.isPending ? <Spinner /> : null}
                Save shortlist
              </Button>
              <Button
                disabled={dispatched || !requestApproved || selected.length === 0 || ineligibleSelected.length > 0}
                onClick={() => setDispatchOpen(true)}
              >
                <Send className="h-3.5 w-3.5" />
                Review & dispatch
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dispatchOpen} onOpenChange={(open) => (open ? setDispatchOpen(true) : setDispatchOpen(false))}>
        <DialogContent
          title="Confirm dispatch"
          description="Notifications are created for each selected student. This cannot be undone or repeated for this role."
        >
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <p className="font-medium text-foreground">
                {selected.length} student(s) will be notified for {data.role.title}
              </p>
              <p className="text-muted-foreground">
                Eligibility is re-checked inside the dispatch transaction. If a profile changed, the dispatch is rejected.
              </p>
            </div>

            <Field label="Additional message" htmlFor="dispatchMessage" hint="Optional — appended to the notification">
              <Textarea id="dispatchMessage" rows={3} value={message} onChange={(event) => setMessage(event.target.value)} />
            </Field>

            {ineligibleFromServer.length > 0 ? (
              <Alert tone="error" title="Dispatch rejected">
                <ul className="list-disc space-y-0.5 pl-4">
                  {ineligibleFromServer.map((item) => (
                    <li key={item.studentId}>
                      {item.fullName} — {item.reasons[0] ?? 'no longer eligible'}
                    </li>
                  ))}
                </ul>
              </Alert>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDispatchOpen(false)}>
                Cancel
              </Button>
              <Button disabled={dispatch.isPending} onClick={() => dispatch.mutate()}>
                {dispatch.isPending ? <Spinner /> : <Send className="h-3.5 w-3.5" />}
                Send notifications
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
