import { useState } from 'react';
import type { EducationLevel } from '@campusconnect/shared';
import { errorMessage } from '@/lib/api';
import { useStudentProfile } from '@/hooks/useStudent';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, LoadingState, PageHeader } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/badge';
import { PersonalDetailsForm } from '@/components/student/PersonalDetailsForm';
import { EducationForm } from '@/components/student/EducationForm';
import { SkillsForm } from '@/components/student/SkillsForm';
import { ExperienceSection } from '@/components/student/ExperienceSection';
import { cn } from '@/lib/utils';

const tabs = [
  { value: 'personal', label: 'Personal & contact' },
  { value: 'academics', label: 'Academics' },
  { value: 'skills', label: 'Skills' },
  { value: 'experience', label: 'Experience' },
] as const;

type TabValue = (typeof tabs)[number]['value'];

const educationSections: { level: EducationLevel; title: string; description: string }[] = [
  { level: 'CLASS_10', title: 'Class 10', description: 'Board, passing year and percentage.' },
  { level: 'CLASS_12', title: 'Class 12', description: 'Board, stream, passing year and percentage.' },
  { level: 'UNDERGRAD', title: 'Undergraduate education', description: 'Degree, branch, institution, graduation year and score.' },
  { level: 'POSTGRAD', title: 'Postgraduate education (optional)', description: 'Only add this if you have a postgraduate qualification.' },
];

export const StudentProfilePage = () => {
  const [tab, setTab] = useState<TabValue>('personal');
  const profile = useStudentProfile();

  if (profile.isLoading) return <LoadingState label="Loading your profile" />;
  if (profile.isError) return <ErrorState message={errorMessage(profile.error)} onRetry={() => profile.refetch()} />;
  if (!profile.data) return <LoadingState label="Loading your profile" />;

  const data = profile.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Your profile"
        description="This is the record the placement cell evaluates. Only you can edit it; administrators can view it for placement decisions."
        actions={<Badge variant="info">{data.skills.length} skills selected</Badge>}
      />

      <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-white p-1">
        {tabs.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setTab(item.value)}
            className={cn(
              'whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors',
              tab === item.value ? 'bg-navy-900 text-white' : 'text-navy-600 hover:bg-navy-50',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'personal' ? (
        <Card>
          <CardHeader>
            <CardTitle>Personal information</CardTitle>
            <p className="text-sm text-muted-foreground">Your email address is the sign-in identity and cannot be changed here.</p>
          </CardHeader>
          <CardContent>
            <PersonalDetailsForm profile={data} />
          </CardContent>
        </Card>
      ) : null}

      {tab === 'academics' ? (
        <div className="space-y-4">
          {educationSections.map((section) => (
            <Card key={section.level}>
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
                <p className="text-sm text-muted-foreground">{section.description}</p>
              </CardHeader>
              <CardContent>
                <EducationForm level={section.level} record={data.education.find((item) => item.level === section.level) ?? null} />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {tab === 'skills' ? (
        <Card>
          <CardHeader>
            <CardTitle>Skills</CardTitle>
            <p className="text-sm text-muted-foreground">
              Choose from the college skill catalogue. Free-text skills are not accepted, so eligibility matching stays consistent.
            </p>
          </CardHeader>
          <CardContent>
            <SkillsForm profile={data} />
          </CardContent>
        </Card>
      ) : null}

      {tab === 'experience' ? (
        <Card>
          <CardHeader>
            <CardTitle>Experience</CardTitle>
          </CardHeader>
          <CardContent>
            <ExperienceSection profile={data} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};
