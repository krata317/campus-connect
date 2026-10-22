import type { JobCriteria, SkillSummary } from '@campusconnect/shared';
import { employmentTypeLabel } from '@/lib/utils';

const row = (label: string, value: string) => (
  <div key={label} className="flex flex-col gap-0.5 border-b border-border/70 py-1.5 last:border-0 sm:flex-row sm:justify-between sm:gap-4">
    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
    <dd className="text-sm text-navy-800 sm:text-right">{value}</dd>
  </div>
);

export const CriteriaSummary = ({ criteria, skills }: { criteria: JobCriteria; skills: SkillSummary[] }) => {
  const nameOf = (id: string) => skills.find((skill) => skill.id === id)?.name ?? 'Unknown skill';

  const rows: { label: string; value: string }[] = [];

  if (criteria.minClass10Percentage !== null) rows.push({ label: 'Min. Class 10', value: `${criteria.minClass10Percentage}%` });
  if (criteria.minClass12Percentage !== null) rows.push({ label: 'Min. Class 12', value: `${criteria.minClass12Percentage}%` });
  if (criteria.undergradScoreType !== null && criteria.minUndergradScore !== null) {
    rows.push({
      label: 'Min. undergraduate score',
      value:
        criteria.undergradScoreType === 'CGPA'
          ? `${criteria.minUndergradScore} / ${criteria.undergradScoreScale ?? '?'} CGPA`
          : `${criteria.minUndergradScore}%`,
    });
  }
  if (criteria.allowedDegrees.length > 0) rows.push({ label: 'Eligible degrees', value: criteria.allowedDegrees.join(', ') });
  if (criteria.allowedBranches.length > 0) rows.push({ label: 'Eligible branches', value: criteria.allowedBranches.join(', ') });
  if (criteria.graduationYears.length > 0) rows.push({ label: 'Graduation years', value: criteria.graduationYears.join(', ') });
  if (criteria.maxActiveBacklogs !== null) rows.push({ label: 'Max. active backlogs', value: String(criteria.maxActiveBacklogs) });
  if (criteria.minExperienceMonths !== null) rows.push({ label: 'Min. experience', value: `${criteria.minExperienceMonths} months` });
  if (criteria.requiredSkillIds.length > 0) {
    rows.push({
      label: criteria.skillMode === 'ALL' ? 'Required skills (all)' : 'Required skills (any one)',
      value: criteria.requiredSkillIds.map(nameOf).join(', '),
    });
  }
  if (criteria.optionalSkillIds.length > 0) {
    rows.push({ label: 'Preferred skills', value: criteria.optionalSkillIds.map(nameOf).join(', ') });
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
        No structured criteria were set, so every registered student is eligible.
      </p>
    );
  }

  return <dl className="divide-y divide-border/70">{rows.map((item) => row(item.label, item.value))}</dl>;
};

export const RoleMeta = ({ location, employmentType }: { location: string | null; employmentType: string | null }) => (
  <p className="text-xs text-muted-foreground">
    {location ?? 'Location not specified'} · {employmentTypeLabel(employmentType)}
  </p>
);
