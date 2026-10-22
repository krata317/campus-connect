import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, ClipboardList, Plus } from 'lucide-react';
import type { EmployerCompany, HiringRequest } from '@campusconnect/shared';
import { api, errorMessage } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui/feedback';
import { TD, TH, TBody, THead, TR, Table, TableWrap } from '@/components/ui/table';
import { cn, formatDate, statusLabel, statusTone } from '@/lib/utils';

export const EmployerDashboardPage = () => {
  const company = useQuery({
    queryKey: ['employer', 'company'],
    queryFn: () => api.get<EmployerCompany>('/employer/me/company'),
  });

  const requests = useQuery({
    queryKey: ['employer', 'requests'],
    queryFn: () => api.get<{ items: HiringRequest[] }>('/employer/me/requests').then((response) => response.items),
  });

  if (company.isLoading || requests.isLoading) return <LoadingState label="Loading your employer workspace" />;
  if (company.isError) return <ErrorState message={errorMessage(company.error)} onRetry={() => company.refetch()} />;
  if (requests.isError) return <ErrorState message={errorMessage(requests.error)} onRetry={() => requests.refetch()} />;

  const detail = company.data as EmployerCompany;
  const list = requests.data ?? [];
  const approved = detail.account.approvalStatus === 'APPROVED';

  const counts = {
    total: list.length,
    draft: list.filter((item) => item.status === 'DRAFT').length,
    submitted: list.filter((item) => item.status === 'SUBMITTED').length,
    approved: list.filter((item) => item.status === 'APPROVED').length,
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={detail.company.name}
        description="Track your approval status, submit hiring requests and follow their review."
        actions={
          approved ? (
            <Link to="/employer/requests/new" className={cn(buttonVariants())}>
              <Plus className="h-4 w-4" />
              New hiring request
            </Link>
          ) : (
            <span className={cn(buttonVariants({ variant: 'outline' }), 'cursor-not-allowed opacity-60')}>
              <Plus className="h-4 w-4" />
              New hiring request
            </span>
          )
        }
      />

      {detail.account.approvalStatus === 'PENDING' ? (
        <Alert tone="warning" title="Your account is waiting for college approval">
          Hiring requests cannot be submitted until a placement administrator approves your company. You can still update your
          company profile in the meantime.
        </Alert>
      ) : null}

      {detail.account.approvalStatus === 'REJECTED' ? (
        <Alert tone="error" title="Your registration was not approved">
          {detail.account.reviewNote ?? 'The placement cell rejected this registration without a note.'} Contact the placement
          cell directly if you believe this is a mistake.
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total requests', value: counts.total },
          { label: 'Drafts', value: counts.draft },
          { label: 'Awaiting review', value: counts.submitted },
          { label: 'Approved', value: counts.approved },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{stat.label}</p>
              <p className="mt-1 text-2xl font-semibold text-navy-900">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Company profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-navy-500" />
              <span className="font-medium text-navy-900">{detail.company.name}</span>
              <Badge variant={detail.account.approvalStatus === 'APPROVED' ? 'success' : detail.account.approvalStatus === 'PENDING' ? 'warning' : 'destructive'}>
                {statusLabel(detail.account.approvalStatus)}
              </Badge>
            </div>
            <dl className="space-y-1.5 text-muted-foreground">
              <div className="flex justify-between gap-3">
                <dt>Website</dt>
                <dd className="text-right text-navy-800">{detail.company.website ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Contact</dt>
                <dd className="text-right text-navy-800">{detail.company.contactPersonName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Phone</dt>
                <dd className="text-right text-navy-800">{detail.company.contactPhone}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Company email</dt>
                <dd className="text-right text-navy-800">{detail.company.contactEmail}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Registered</dt>
                <dd className="text-right text-navy-800">{formatDate(detail.company.createdAt)}</dd>
              </div>
            </dl>
            <Link to="/employer/company" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full')}>
              Edit company profile
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent hiring requests</CardTitle>
            <Link to="/employer/requests" className="text-xs font-medium text-navy-700 hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {list.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<ClipboardList className="h-6 w-6" />}
                  title="No hiring requests yet"
                  description={
                    approved
                      ? 'Create your first request with structured eligibility criteria so the placement cell can evaluate students.'
                      : 'Once an administrator approves your company you can submit hiring requests.'
                  }
                  action={
                    approved ? (
                      <Link to="/employer/requests/new" className={cn(buttonVariants({ size: 'sm' }))}>
                        Create request
                      </Link>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <TableWrap className="rounded-none border-0">
                <Table>
                  <THead>
                    <TR>
                      <TH>Request</TH>
                      <TH>Roles</TH>
                      <TH>Status</TH>
                      <TH>Submitted</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {list.slice(0, 6).map((request) => (
                      <TR key={request.id}>
                        <TD>
                          <Link to={`/employer/requests/${request.id}`} className="font-medium text-navy-800 hover:underline">
                            {request.title}
                          </Link>
                        </TD>
                        <TD>{request.roles.length}</TD>
                        <TD>
                          <Badge variant={statusTone(request.status)}>{statusLabel(request.status)}</Badge>
                        </TD>
                        <TD className="text-muted-foreground">{formatDate(request.submittedAt)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
