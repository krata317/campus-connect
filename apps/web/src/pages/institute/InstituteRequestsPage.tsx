import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, Search } from 'lucide-react';
import type { HiringRequest, RequestStatus } from '@campusconnect/shared';
import { api, errorMessage } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/form';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui/feedback';
import { TD, TH, TBody, THead, TR, Table, TableWrap } from '@/components/ui/table';
import { formatDate, statusLabel, statusTone } from '@/lib/utils';

const filters: { value: RequestStatus | 'ALL'; label: string }[] = [
  { value: 'SUBMITTED', label: 'Awaiting review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'CHANGES_REQUESTED', label: 'Changes requested' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'ALL', label: 'All' },
];

export const InstituteRequestsPage = () => {
  const [status, setStatus] = useState<RequestStatus | 'ALL'>('SUBMITTED');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  const requests = useQuery({
    queryKey: ['institute', 'requests', status, query],
    queryFn: () => {
      const params = new URLSearchParams();
      if (status !== 'ALL') params.set('status', status);
      if (query) params.set('q', query);
      return api.get<{ items: HiringRequest[] }>(`/institute/requests?${params.toString()}`).then((response) => response.items);
    },
  });

  if (requests.isError) return <ErrorState message={errorMessage(requests.error)} onRetry={() => requests.refetch()} />;

  const items = requests.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Hiring requests"
        description="Approve a request to unlock shortlisting for its roles, or return it to the recruiter with a note."
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1">
          {filters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setStatus(filter.value)}
              className={
                status === filter.value
                  ? 'whitespace-nowrap rounded-md bg-navy-900 px-3 py-1.5 text-sm font-medium text-white'
                  : 'whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted'
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
          <div className="relative w-full lg:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Request or company" className="pl-8" />
          </div>
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
      </div>

      {requests.isLoading ? (
        <LoadingState label="Loading requests" />
      ) : items.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<ClipboardCheck className="h-6 w-6" />}
              title="No requests in this view"
              description="Requests appear here once an approved recruiter submits them."
            />
          </CardContent>
        </Card>
      ) : (
        <TableWrap>
          <Table>
            <THead>
              <TR>
                <TH>Request</TH>
                <TH>Company</TH>
                <TH>Roles</TH>
                <TH>Status</TH>
                <TH>Submitted</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {items.map((request) => (
                <TR key={request.id}>
                  <TD className="font-medium text-foreground">{request.title}</TD>
                  <TD>{request.recruiterName}</TD>
                  <TD>{request.roles.length}</TD>
                  <TD>
                    <Badge variant={statusTone(request.status)}>{statusLabel(request.status)}</Badge>
                  </TD>
                  <TD className="text-muted-foreground">{formatDate(request.submittedAt)}</TD>
                  <TD className="text-right">
                    <Link to={`/institute/requests/${request.id}`} className="text-sm font-medium text-foreground hover:underline">
                      Review
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
