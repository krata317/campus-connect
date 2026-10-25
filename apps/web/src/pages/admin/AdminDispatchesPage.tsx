import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BellRing } from 'lucide-react';
import type { DispatchSummary } from '@campusconnect/shared';
import { api, errorMessage } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui/feedback';
import { TD, TH, TBody, THead, TR, Table, TableWrap } from '@/components/ui/table';
import { cn, formatDateTime } from '@/lib/utils';

export const AdminDispatchesPage = () => {
  const dispatches = useQuery({
    queryKey: ['admin', 'dispatches'],
    queryFn: () => api.get<{ items: DispatchSummary[] }>('/admin/dispatches').then((response) => response.items),
  });

  if (dispatches.isLoading) return <LoadingState label="Loading dispatch history" />;
  if (dispatches.isError) return <ErrorState message={errorMessage(dispatches.error)} onRetry={() => dispatches.refetch()} />;

  const items = dispatches.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dispatch history"
        description="Every role that has had a shortlist dispatched, with how many notifications were created and how many students have read them."
      />

      {items.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<BellRing className="h-6 w-6" />}
              title="No dispatches yet"
              description="Open an approved request, choose a role, review eligible students and confirm a dispatch."
              action={
                <Link to="/admin/requests" className={cn(buttonVariants({ size: 'sm' }))}>
                  Go to requests
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
                <TH>Company</TH>
                <TH>Role</TH>
                <TH>Request</TH>
                <TH>Recipients</TH>
                <TH>Read</TH>
                <TH>Dispatched</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((item) => (
                <TR key={item.roleId}>
                  <TD className="font-medium text-navy-900">{item.companyName}</TD>
                  <TD>{item.roleTitle}</TD>
                  <TD className="text-muted-foreground">{item.requestTitle}</TD>
                  <TD>
                    <Badge variant="info">{item.recipientCount}</Badge>
                  </TD>
                  <TD>
                    <Badge variant={item.readCount === item.recipientCount ? 'success' : 'outline'}>
                      {item.readCount}/{item.recipientCount}
                    </Badge>
                  </TD>
                  <TD className="text-muted-foreground">{formatDateTime(item.dispatchedAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      )}
    </div>
  );
};
