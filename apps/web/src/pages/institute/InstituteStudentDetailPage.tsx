import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import type { ProfileCompletion, StudentProfile } from '@campusconnect/shared';
import { api, errorMessage } from '@/lib/api';
import { DeletedNotice } from '@/components/shared/DeletedNotice';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui/feedback';
import { TD, TH, TBody, THead, TR, Table, TableWrap } from '@/components/ui/table';
import { cn, formatDate, formatDateTime, scoreText, statusLabel, statusTone } from '@/lib/utils';

interface StudentDetail {
  profile: StudentProfile;
  completion: ProfileCompletion;
  shortlistHistory: {
    roleId: string;
    roleTitle: string;
    requestId: string;
    requestTitle: string;
    recruiterName: string | null;
    status: string;
    shortlistedAt: string | null;
    dispatchedAt: string | null;
    notificationReadAt: string | null;
  }[];
  notificationCount: number;
  skillCatalogueSize: number;
}

const levelLabel: Record<string, string> = {
  CLASS_10: 'Class 10',
  CLASS_12: 'Class 12',
  UNDERGRAD: 'Undergraduate',
  POSTGRAD: 'Postgraduate',
};

export const InstituteStudentDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const detail = useQuery({
    queryKey: ['institute', 'student', id],
    queryFn: () => api.get<StudentDetail>(`/institute/students/${id}`),
  });

  if (detail.isLoading) return <LoadingState label="Loading student record" />;
  if (detail.isError) return <ErrorState message={errorMessage(detail.error)} onRetry={() => detail.refetch()} />;

  const data = detail.data as StudentDetail;
  const profile = data.profile;

  return (
    <div className="space-y-5">
      <PageHeader
        title={profile.fullName}
        description={`${profile.email}${profile.phone ? ` · ${profile.phone}` : ''}`}
        actions={
          <Link to="/institute/students" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to students
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Profile completion</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-2xl font-semibold text-foreground">{data.completion.percent}%</p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${data.completion.percent}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              {data.completion.completed} of {data.completion.total} details recorded
            </p>
            {data.completion.missing.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {data.completion.missing.map((item) => (
                  <Badge key={item} variant="secondary">
                    {item}
                  </Badge>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Placement-relevant facts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Active backlogs</span>
              <span className="font-medium text-foreground">{profile.activeBacklogs === null ? 'Not reported' : profile.activeBacklogs}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Skills</span>
              <span className="font-medium text-foreground">{profile.skills.length}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Experience records</span>
              <span className="font-medium text-foreground">{profile.experiences.length}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Notifications</span>
              <span className="font-medium text-foreground">{data.notificationCount}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Registered</span>
              <span className="font-medium text-foreground">{formatDate(profile.createdAt)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contact & links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">{[profile.city, profile.state].filter(Boolean).join(', ') || 'Location not provided'}</p>
            {profile.linkedin ? (
              <a href={profile.linkedin} target="_blank" rel="noreferrer noopener" className="block text-foreground hover:underline">
                LinkedIn
              </a>
            ) : null}
            {profile.github ? (
              <a href={profile.github} target="_blank" rel="noreferrer noopener" className="block text-foreground hover:underline">
                GitHub
              </a>
            ) : null}
            {profile.portfolio ? (
              <a href={profile.portfolio} target="_blank" rel="noreferrer noopener" className="block text-foreground hover:underline">
                Portfolio
              </a>
            ) : null}
            {!profile.linkedin && !profile.github && !profile.portfolio ? (
              <p className="text-muted-foreground">No external links provided.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Education</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {profile.education.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No education records" description="The student has not added academic details yet." />
            </div>
          ) : (
            <TableWrap className="rounded-none border-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Level</TH>
                    <TH>Institution / board</TH>
                    <TH>Degree / stream</TH>
                    <TH>Year</TH>
                    <TH>Score</TH>
                  </TR>
                </THead>
                <TBody>
                  {profile.education.map((record) => (
                    <TR key={record.id}>
                      <TD className="font-medium">{levelLabel[record.level] ?? record.level}</TD>
                      <TD>{record.institution ?? record.board ?? '—'}</TD>
                      <TD>{record.degree ? `${record.degree}${record.branch ? ` — ${record.branch}` : ''}` : record.stream ?? '—'}</TD>
                      <TD>{record.passingYear ?? '—'}</TD>
                      <TD>{scoreText(record.scoreType, record.scoreValue, record.scoreScale)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Skills</CardTitle>
          </CardHeader>
          <CardContent>
            {profile.skills.length === 0 ? (
              <p className="text-sm text-muted-foreground">No skills selected.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {profile.skills.map((skill) => (
                  <Badge key={skill.id} variant={skill.active ? 'info' : 'outline'}>
                    {skill.name}
                    {skill.active ? '' : ' (inactive)'}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Experience</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {profile.experiences.length === 0 ? (
              <p className="text-sm text-muted-foreground">No experience records.</p>
            ) : (
              profile.experiences.map((record) => (
                <div key={record.id} className="rounded-md border border-border p-3">
                  <p className="text-sm font-medium text-foreground">
                    {record.jobTitle} · {record.organization}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {record.startDate} → {record.isCurrent ? 'Present' : record.endDate ?? '—'}
                  </p>
                  {record.description ? <p className="mt-1 text-sm text-foreground">{record.description}</p> : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Shortlist history</CardTitle>
          <p className="text-sm text-muted-foreground">Roles this student has been nominated for, per role.</p>
        </CardHeader>
        <CardContent className="p-0">
          {data.shortlistHistory.length === 0 ? (
            <div className="p-5">
              <EmptyState title="Not shortlisted yet" description="This student has not been included in any shortlist." />
            </div>
          ) : (
            <TableWrap className="rounded-none border-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Company</TH>
                    <TH>Role</TH>
                    <TH>Status</TH>
                    <TH>Shortlisted</TH>
                    <TH>Dispatched</TH>
                    <TH>Read</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.shortlistHistory.map((entry) => (
                    <TR key={`${entry.roleId}-${entry.shortlistedAt ?? ''}`}>
                      <TD className="font-medium">{entry.recruiterName ?? <DeletedNotice kind="RECRUITER" />}</TD>
                      <TD>
                        <p>{entry.roleTitle}</p>
                        <p className="text-xs text-muted-foreground">{entry.requestTitle}</p>
                      </TD>
                      <TD>
                        <Badge variant={statusTone(entry.status)}>{statusLabel(entry.status)}</Badge>
                      </TD>
                      <TD className="text-muted-foreground">{formatDateTime(entry.shortlistedAt)}</TD>
                      <TD className="text-muted-foreground">{formatDateTime(entry.dispatchedAt)}</TD>
                      <TD className="text-muted-foreground">{entry.notificationReadAt ? formatDateTime(entry.notificationReadAt) : 'Unread'}</TD>
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
