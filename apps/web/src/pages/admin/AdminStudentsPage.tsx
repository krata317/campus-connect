import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Users } from 'lucide-react';
import type { AdminStudentListItem, Paginated } from '@campusconnect/shared';
import { api, errorMessage } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/form';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui/feedback';
import { TD, TH, TBody, THead, TR, Table, TableWrap } from '@/components/ui/table';
import { formatDate, scoreText } from '@/lib/utils';

const PAGE_SIZE = 20;

export const AdminStudentsPage = () => {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const students = useQuery({
    queryKey: ['admin', 'students', query, page],
    queryFn: () => api.get<Paginated<AdminStudentListItem>>(`/admin/students?q=${encodeURIComponent(query)}&page=${page}&pageSize=${PAGE_SIZE}`),
  });

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setQuery(search.trim());
  };

  if (students.isError) return <ErrorState message={errorMessage(students.error)} onRetry={() => students.refetch()} />;

  const data = students.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-5">
      <PageHeader title="Students" description="Search registered students and open a profile to inspect academic records, skills and experience." />

      <form onSubmit={submitSearch} className="flex gap-2">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or email"
            className="pl-8"
          />
        </div>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      {students.isLoading ? (
        <LoadingState label="Loading students" />
      ) : !data || data.items.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<Users className="h-6 w-6" />}
              title={query ? 'No students match that search' : 'No students have registered yet'}
              description={
                query
                  ? 'Try a different name or email address.'
                  : 'Students appear here as soon as they register for your college. Share the student registration page with them — only accounts that selected this college are visible to you.'
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>Student</TH>
                  <TH>Undergraduate</TH>
                  <TH>Score</TH>
                  <TH>Backlogs</TH>
                  <TH>Skills</TH>
                  <TH>Registered</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {data.items.map((student) => (
                  <TR key={student.id}>
                    <TD>
                      <p className="font-medium text-navy-900">{student.fullName}</p>
                      <p className="text-xs text-muted-foreground">{student.email}</p>
                    </TD>
                    <TD>
                      {student.undergradDegree ? (
                        <>
                          <p className="text-sm">{student.undergradDegree}</p>
                          <p className="text-xs text-muted-foreground">{student.undergradBranch ?? '—'}</p>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not added</span>
                      )}
                    </TD>
                    <TD>
                      <p className="text-sm">{scoreText(student.undergradScoreType, student.undergradScoreValue, student.undergradScoreScale)}</p>
                      <p className="text-xs text-muted-foreground">{student.undergradPassingYear ?? '—'}</p>
                    </TD>
                    <TD>
                      {student.activeBacklogs === null ? (
                        <Badge variant="outline">Not reported</Badge>
                      ) : (
                        <Badge variant={student.activeBacklogs === 0 ? 'success' : 'warning'}>{student.activeBacklogs}</Badge>
                      )}
                    </TD>
                    <TD>{student.skillCount}</TD>
                    <TD className="text-muted-foreground">{formatDate(student.createdAt)}</TD>
                    <TD className="text-right">
                      <Link to={`/admin/students/${student.id}`} className="text-sm font-medium text-navy-700 hover:underline">
                        Open
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {data.page} of {totalPages} · {data.total} student(s)
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
