import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, ClipboardList, Plus } from 'lucide-react';
import type { HiringRequest, RecruiterProfile } from '@campusconnect/shared';
import { api, errorMessage } from '@/lib/api';
import { DeletedNotice } from '@/components/shared/DeletedNotice';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui/feedback';
import { TD, TH, TBody, THead, TR, Table, TableWrap } from '@/components/ui/table';
import { cn, formatDate, statusLabel, statusTone } from '@/lib/utils';

export const RecruiterDashboardPage = () => {
  const profile = useQuery({
    queryKey: ['recruiter', 'profile'],
    queryFn: () => api.get<RecruiterProfile>('/recruiter/profile'),
  });

  const requests = useQuery({
    queryKey: ['recruiter', 'requests'],
    queryFn: () => api.get<{ items: HiringRequest[] }>('/recruiter/requests').then((response) => response.items),
  });

  if (profile.isLoading || requests.isLoading) return <LoadingState label="Loading your workspace" />;
  if (profile.isError) return <ErrorState message={errorMessage(profile.error)} onRetry={() => profile.refetch()} />;
  if (requests.isError) return <ErrorState message={errorMessage(requests.error)} onRetry={() => requests.refetch()} />;

  const detail = profile.data as RecruiterProfile;
  const list = requests.data ?? [];

  const counts = {
    draft: list.filter((item) => item.status === 'DRAFT').length,
    submitted: list.filter((item) => item.status === 'SUBMITTED').length,
    approved: list.filter((item) => item.status === 'APPROVED').length,
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={detail.companyName}
        description="Send hiring requests to any registered institute and follow each one through review."
        actions={
          <Link to="/recruiter/requests/new" className={cn(buttonVariants())}>
            <Plus className="h-4 w-4" />
            New hiring request
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Drafts</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{counts.draft}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Awaiting review</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{counts.submitted}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Approved</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{counts.approved}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Company profile</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">{detail.companyName}</p>
            <p className="text-muted-foreground">
              {detail.contactPersonName} · {detail.contactPhone}
            </p>
            <p className="text-muted-foreground">{detail.email}</p>
          </div>
          <Link to="/recruiter/company" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            <Building2 className="h-3.5 w-3.5" />
            Edit profile
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent requests</CardTitle>
        </CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <EmptyState
              icon={<ClipboardList className="h-6 w-6" />}
              title="No hiring requests yet"
              description="A request groups one or more job roles. Each role carries its own eligibility criteria and shortlist."
              action={
                <Link to="/recruiter/requests/new" className={cn(buttonVariants({ size: 'sm' }))}>
                  Create your first request
                </Link>
              }
            />
          ) : (
            <TableWrap className="border-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Request</TH>
                    <TH>Institute</TH>
                    <TH>Roles</TH>
                    <TH>Status</TH>
                    <TH>Created</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {list.slice(0, 6).map((request) => (
                    <TR key={request.id}>
                      <TD className="font-medium">{request.title}</TD>
                      <TD className="text-muted-foreground">{request.instituteDeleted ? <DeletedNotice kind="INSTITUTE" /> : request.instituteName}</TD>
                      <TD>{request.roles.length}</TD>
                      <TD>
                        <Badge variant={statusTone(request.status)}>{statusLabel(request.status)}</Badge>
                      </TD>
                      <TD className="text-muted-foreground">{formatDate(request.createdAt)}</TD>
                      <TD className="text-right">
                        <Link to={`/recruiter/requests/${request.id}`} className="text-sm font-medium text-primary hover:underline">
                          Open
                        </Link>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
