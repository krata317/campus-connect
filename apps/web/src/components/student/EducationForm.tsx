import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { class10Schema, class12Schema, postgradSchema, undergradSchema } from '@campusconnect/shared';
import type { EducationLevel, EducationRecord, StudentProfile } from '@campusconnect/shared';
import type { ZodTypeAny } from 'zod';
import { Alert, Spinner } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { api, errorMessage } from '@/lib/api';
import { applyFieldErrors, resolver } from '@/lib/form';
import { profileQueryKey } from '@/hooks/useStudent';
import { scoreText } from '@/lib/utils';

type EducationFormValues = {
  board: string;
  stream: string;
  degree: string;
  branch: string;
  institution: string;
  passingYear: string;
  scoreType: 'PERCENTAGE' | 'CGPA';
  scoreValue: string;
  scoreScale: string;
};

const schemaFor = (level: EducationLevel): ZodTypeAny => {
  if (level === 'CLASS_10') return class10Schema;
  if (level === 'CLASS_12') return class12Schema;
  if (level === 'POSTGRAD') return postgradSchema;
  return undergradSchema;
};

const toValues = (record: EducationRecord | null): EducationFormValues => ({
  board: record?.board ?? '',
  stream: record?.stream ?? '',
  degree: record?.degree ?? '',
  branch: record?.branch ?? '',
  institution: record?.institution ?? '',
  passingYear: record?.passingYear === null || record?.passingYear === undefined ? '' : String(record.passingYear),
  scoreType: record?.scoreType ?? 'PERCENTAGE',
  scoreValue: record?.scoreValue === null || record?.scoreValue === undefined ? '' : String(record.scoreValue),
  scoreScale: record?.scoreScale === null || record?.scoreScale === undefined ? '' : String(record.scoreScale),
});

export const EducationForm = ({ level, record }: { level: EducationLevel; record: EducationRecord | null }) => {
  const queryClient = useQueryClient();
  const isSchool = level === 'CLASS_10' || level === 'CLASS_12';

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty },
    setError,
  } = useForm<EducationFormValues>({
    resolver: resolver<EducationFormValues>(schemaFor(level)),
    defaultValues: toValues(record),
  });

  useEffect(() => {
    reset(toValues(record));
  }, [record, reset]);

  const scoreType = watch('scoreType');

  const save = useMutation({
    mutationFn: (values: EducationFormValues) => {
      const payload = isSchool
        ? {
            board: values.board,
            ...(level === 'CLASS_12' ? { stream: values.stream } : {}),
            passingYear: values.passingYear,
            scoreValue: values.scoreValue,
          }
        : {
            degree: values.degree,
            branch: values.branch,
            institution: values.institution,
            passingYear: values.passingYear,
            scoreType: values.scoreType,
            scoreValue: values.scoreValue,
            scoreScale: values.scoreType === 'CGPA' ? values.scoreScale : null,
          };
      return api.put<{ profile: StudentProfile }>(`/students/me/education/${level}`, payload);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(profileQueryKey, data.profile);
      queryClient.invalidateQueries({ queryKey: ['student'] });
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError)) {
        setError('scoreValue', { type: 'server', message: errorMessage(error) });
      }
    },
  });

  const remove = useMutation({
    mutationFn: () => api.delete<{ profile: StudentProfile }>(`/students/me/education/${level}`),
    onSuccess: (data) => {
      queryClient.setQueryData(profileQueryKey, data.profile);
      queryClient.invalidateQueries({ queryKey: ['student'] });
    },
  });

  return (
    <form className="space-y-4" onSubmit={handleSubmit((values) => save.mutate(values))} noValidate>
      {isSchool ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Board" htmlFor={`${level}-board`} error={errors.board?.message} required>
            <Input id={`${level}-board`} placeholder="CBSE, ICSE, State board…" {...register('board')} />
          </Field>
          {level === 'CLASS_12' ? (
            <Field label="Stream" htmlFor={`${level}-stream`} error={errors.stream?.message} required>
              <Input id={`${level}-stream`} placeholder="Science (PCM), Commerce…" {...register('stream')} />
            </Field>
          ) : null}
          <Field label="Passing year" htmlFor={`${level}-year`} error={errors.passingYear?.message} required>
            <Input id={`${level}-year`} type="number" min={1950} {...register('passingYear')} />
          </Field>
          <Field label="Percentage" htmlFor={`${level}-score`} error={errors.scoreValue?.message} hint="0 – 100" required>
            <Input id={`${level}-score`} type="number" step="0.01" min={0} max={100} {...register('scoreValue')} />
          </Field>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Degree" htmlFor={`${level}-degree`} error={errors.degree?.message} required>
              <Input id={`${level}-degree`} placeholder="B.Tech, B.Sc, M.Tech…" {...register('degree')} />
            </Field>
            <Field label="Branch / specialisation" htmlFor={`${level}-branch`} error={errors.branch?.message} required>
              <Input id={`${level}-branch`} placeholder="Computer Science…" {...register('branch')} />
            </Field>
            <Field label="Institution" htmlFor={`${level}-institution`} error={errors.institution?.message} required>
              <Input id={`${level}-institution`} {...register('institution')} />
            </Field>
            <Field
              label={level === 'UNDERGRAD' ? 'Passing or expected year' : 'Passing year'}
              htmlFor={`${level}-year`}
              error={errors.passingYear?.message}
              required
            >
              <Input id={`${level}-year`} type="number" min={1950} {...register('passingYear')} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Score type" htmlFor={`${level}-type`} error={errors.scoreType?.message} required>
              <Select id={`${level}-type`} {...register('scoreType')}>
                <option value="PERCENTAGE">Percentage</option>
                <option value="CGPA">CGPA</option>
              </Select>
            </Field>
            <Field
              label={scoreType === 'CGPA' ? 'CGPA' : 'Percentage'}
              htmlFor={`${level}-score`}
              error={errors.scoreValue?.message}
              required
            >
              <Input
                id={`${level}-score`}
                type="number"
                step="0.01"
                min={0}
                max={scoreType === 'CGPA' ? undefined : 100}
                {...register('scoreValue')}
              />
            </Field>
            {scoreType === 'CGPA' ? (
              <Field label="CGPA scale" htmlFor={`${level}-scale`} error={errors.scoreScale?.message} hint="e.g. 10 or 4" required>
                <Input id={`${level}-scale`} type="number" step="0.1" min={1} {...register('scoreScale')} />
              </Field>
            ) : null}
          </div>
        </div>
      )}

      {record ? (
        <p className="text-xs text-muted-foreground">
          Saved record: {scoreText(record.scoreType, record.scoreValue, record.scoreScale)}
          {record.passingYear ? ` · ${record.passingYear}` : ''}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Not added yet.</p>
      )}

      {save.isError ? <Alert tone="error">{errorMessage(save.error)}</Alert> : null}
      {save.isSuccess ? <Alert tone="success">Education record saved.</Alert> : null}
      {remove.isError ? <Alert tone="error">{errorMessage(remove.error)}</Alert> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {level === 'POSTGRAD' && record ? (
          <Button
            variant="ghost"
            className="text-destructive hover:bg-red-50"
            onClick={() => {
              if (window.confirm('Remove your postgraduate record? This cannot be undone.')) remove.mutate();
            }}
            disabled={remove.isPending}
          >
            Remove record
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={save.isPending || (!isDirty && Boolean(record))}>
          {save.isPending ? <Spinner /> : null}
          {record ? 'Update record' : 'Save record'}
        </Button>
      </div>
    </form>
  );
};
