import type { FieldErrors, UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form';
import { Trash2 } from 'lucide-react';
import type { SkillSummary } from '@campusconnect/shared';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { SkillPicker } from '@/components/recruiter/SkillPicker';
import type { RequestFormValues } from '@/pages/recruiter/requestForm';

export const RoleFields = ({
  index,
  register,
  errors,
  watch,
  setValue,
  skills,
  onRemove,
  canRemove,
}: {
  index: number;
  register: UseFormRegister<RequestFormValues>;
  errors: FieldErrors<RequestFormValues>;
  watch: UseFormWatch<RequestFormValues>;
  setValue: UseFormSetValue<RequestFormValues>;
  skills: SkillSummary[];
  onRemove: () => void;
  canRemove: boolean;
}) => {
  const roleErrors = errors.roles?.[index];
  const base = `roles.${index}` as const;
  const scoreType = watch(`${base}.undergradScoreType`);
  const requiredSkillIds = watch(`${base}.requiredSkillIds`) ?? [];
  const optionalSkillIds = watch(`${base}.optionalSkillIds`) ?? [];
  const skillMode = watch(`${base}.skillMode`);

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Role {index + 1}</h3>
          <p className="text-xs text-muted-foreground">Each role is shortlisted and dispatched separately.</p>
        </div>
        {canRemove ? (
          <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
            Remove role
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Job title" htmlFor={`${base}-title`} error={roleErrors?.title?.message} required>
          <Input id={`${base}-title`} placeholder="Software Engineer Trainee" {...register(`${base}.title`)} />
        </Field>
        <Field label="Location or work arrangement" htmlFor={`${base}-location`} error={roleErrors?.location?.message}>
          <Input id={`${base}-location`} placeholder="Bengaluru (hybrid)" {...register(`${base}.location`)} />
        </Field>
        <Field label="Employment type" htmlFor={`${base}-type`} error={roleErrors?.employmentType?.message}>
          <Select id={`${base}-type`} {...register(`${base}.employmentType`)}>
            <option value="">Not specified</option>
            <option value="FULL_TIME">Full time</option>
            <option value="INTERNSHIP">Internship</option>
            <option value="PART_TIME">Part time</option>
            <option value="CONTRACT">Contract</option>
          </Select>
        </Field>
        <Field
          label="Registration / application URL"
          htmlFor={`${base}-url`}
          error={roleErrors?.registrationUrl?.message}
          hint="Shown to shortlisted students"
          required
        >
          <Input id={`${base}-url`} placeholder="https://careers.example.com/apply" {...register(`${base}.registrationUrl`)} />
        </Field>
      </div>

      <Field label="Job description" htmlFor={`${base}-description`} error={roleErrors?.description?.message} required>
        <Textarea id={`${base}-description`} rows={4} placeholder="Responsibilities, tech stack, selection process…" {...register(`${base}.description`)} />
      </Field>

      <div className="border-t border-border pt-4">
        <h4 className="text-sm font-semibold text-foreground">Eligibility criteria</h4>
        <p className="text-xs text-muted-foreground">
          Leave a field empty to skip that requirement. Criteria are evaluated against saved student records only.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Min. Class 10 %" htmlFor={`${base}-c10`} error={roleErrors?.minClass10Percentage?.message}>
          <Input id={`${base}-c10`} type="number" min={0} max={100} step="0.01" {...register(`${base}.minClass10Percentage`)} />
        </Field>
        <Field label="Min. Class 12 %" htmlFor={`${base}-c12`} error={roleErrors?.minClass12Percentage?.message}>
          <Input id={`${base}-c12`} type="number" min={0} max={100} step="0.01" {...register(`${base}.minClass12Percentage`)} />
        </Field>
        <Field label="Max. active backlogs" htmlFor={`${base}-backlogs`} error={roleErrors?.maxActiveBacklogs?.message}>
          <Input id={`${base}-backlogs`} type="number" min={0} max={60} {...register(`${base}.maxActiveBacklogs`)} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Undergraduate score type" htmlFor={`${base}-score-type`} error={roleErrors?.undergradScoreType?.message}>
          <Select id={`${base}-score-type`} {...register(`${base}.undergradScoreType`)}>
            <option value="">No minimum score</option>
            <option value="PERCENTAGE">Percentage</option>
            <option value="CGPA">CGPA</option>
          </Select>
        </Field>
        <Field
          label={scoreType === 'CGPA' ? 'Min. CGPA' : 'Min. percentage'}
          htmlFor={`${base}-score`}
          error={roleErrors?.minUndergradScore?.message}
        >
          <Input
            id={`${base}-score`}
            type="number"
            min={0}
            step="0.01"
            disabled={scoreType === ''}
            {...register(`${base}.minUndergradScore`)}
          />
        </Field>
        {scoreType === 'CGPA' ? (
          <Field label="CGPA scale" htmlFor={`${base}-scale`} error={roleErrors?.undergradScoreScale?.message} hint="e.g. 10 or 4">
            <Input id={`${base}-scale`} type="number" min={1} step="0.1" {...register(`${base}.undergradScoreScale`)} />
          </Field>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Eligible degrees"
          htmlFor={`${base}-degrees`}
          error={roleErrors?.allowedDegrees?.message}
          hint="Comma separated, e.g. B.Tech, B.E"
        >
          <Input id={`${base}-degrees`} placeholder="B.Tech, B.E" {...register(`${base}.allowedDegrees`)} />
        </Field>
        <Field
          label="Eligible branches"
          htmlFor={`${base}-branches`}
          error={roleErrors?.allowedBranches?.message}
          hint="Comma separated, e.g. Computer Science, IT"
        >
          <Input id={`${base}-branches`} placeholder="Computer Science, Information Technology" {...register(`${base}.allowedBranches`)} />
        </Field>
        <Field
          label="Eligible graduation years"
          htmlFor={`${base}-years`}
          error={roleErrors?.graduationYears?.message}
          hint="Comma separated, e.g. 2026, 2027"
        >
          <Input id={`${base}-years`} placeholder="2026, 2027" {...register(`${base}.graduationYears`)} />
        </Field>
        <Field
          label="Minimum experience (months)"
          htmlFor={`${base}-experience`}
          error={roleErrors?.minExperienceMonths?.message}
          hint="Leave empty for freshers"
        >
          <Input id={`${base}-experience`} type="number" min={0} max={600} {...register(`${base}.minExperienceMonths`)} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Skill requirement" htmlFor={`${base}-skill-mode`} error={roleErrors?.skillMode?.message}>
          <Select id={`${base}-skill-mode`} {...register(`${base}.skillMode`)}>
            <option value="ALL">All required skills must match</option>
            <option value="ANY">Any one required skill is enough</option>
          </Select>
        </Field>
        <div className="sm:col-span-2 sm:self-end">
          <p className="text-xs text-muted-foreground">
            {skillMode === 'ALL'
              ? 'Students must have every skill marked as required.'
              : 'Students need at least one of the skills marked as required.'}
          </p>
        </div>
      </div>

      <SkillPicker
        skills={skills}
        required={requiredSkillIds}
        optional={optionalSkillIds}
        onChange={(next) => {
          setValue(`${base}.requiredSkillIds`, next.requiredSkillIds, { shouldDirty: true });
          setValue(`${base}.optionalSkillIds`, next.optionalSkillIds, { shouldDirty: true });
        }}
      />
    </div>
  );
};
