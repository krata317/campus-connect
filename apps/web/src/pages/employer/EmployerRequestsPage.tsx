import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Plus } from 'lucide-react';
import type { HiringRequest } from '@campusconnect/shared';
import { api, errorMessage } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui/feedback';
import { TD, TH, TBody, THead, TR, Table, TableWrap } from '@/components/ui/table';
import { cn, formatDate, statusLabel, statusTone } from '@/lib/utils';

export const EmployerRequestsPage = () => {
  const requests = useQuery({
    queryKey: ['employer', 'requests'],
    queryFn: () => api.get<{ items: HiringRequest[] }>('/employer/me/requests').then((response) => response.items),
  });

  if (requests.isLoading) return <LoadingState label="Loading hiring requests" />;
  if (requests.isError) return <ErrorState message={errorMessage(requests.error)} onRetry={() => requests.refetch()} />;

  const list = requests.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Hiring requests"
        description="Drafts and submitted requests. Requests returned for changes can be edited and resubmitted."
        actions={
          <Link to="/employer/requests/new" className={cn(buttonVariants())}>
            <Plus className="h-4 w-4" />
            New request
          </Link>
        }
      />

      {list.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<ClipboardList className="h-6 w-6" />}
              title="No hiring requests yet"
              description="A request groups one or more job roles. Each role carries its own eligibility criteria and shortlist."
              action={
                <Link to="/employer/requests/new" className={cn(buttonVariants({ size: 'sm' }))}>
                  Create your first request
                </Link>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <TableWrap>
          <Table>
            <THead>
              <TR>
                <TH>Request</TH>
                <TH>Roles</TH>
                <TH>Status</TH>
                <TH>Created</TH>
                <TH>Submitted</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {list.map((request) => (
                <TR key={request.id}>
                  <TD className="font-medium text-navy-900">{request.title}</TD>
                  <TD>{request.roles.length}</TD>
                  <TD>
                    <Badge variant={statusTone(request.status)}>{statusLabel(request.status)}</Badge>
                  </TD>
                  <TD className="text-muted-foreground">{formatDate(request.createdAt)}</TD>
                  <TD className="text-muted-foreground">{formatDate(request.submittedAt)}</TD>
                  <TD className="text-right">
                    <Link to={`/employer/requests/${request.id}`} className="text-sm font-medium text-navy-700 hover:underline">
                      Open
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      )}
    </div>
  );
};
