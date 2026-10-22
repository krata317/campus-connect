import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { experienceSchema } from '@campusconnect/shared';
import type { ExperienceRecord, StudentProfile } from '@campusconnect/shared';
import { Alert, EmptyState, Spinner } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { api, errorMessage } from '@/lib/api';
import { applyFieldErrors, resolver } from '@/lib/form';
import { profileQueryKey } from '@/hooks/useStudent';

type ExperienceFormValues = {
  organization: string;
  jobTitle: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  description: string;
};

const emptyValues: ExperienceFormValues = {
  organization: '',
  jobTitle: '',
  startDate: '',
  endDate: '',
  isCurrent: false,
  description: '',
};

const toValues = (record: ExperienceRecord | null): ExperienceFormValues =>
  record
    ? {
        organization: record.organization,
        jobTitle: record.jobTitle,
        startDate: record.startDate,
        endDate: record.endDate ?? '',
        isCurrent: record.isCurrent,
        description: record.description ?? '',
      }
    : emptyValues;

export const ExperienceSection = ({ profile }: { profile: StudentProfile }) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExperienceRecord | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
    setError,
  } = useForm<ExperienceFormValues>({ resolver: resolver<ExperienceFormValues>(experienceSchema), defaultValues: emptyValues });

  const isCurrent = watch('isCurrent');

  const closeDialog = () => {
    setOpen(false);
    setEditing(null);
  };

  const openCreate = () => {
    setEditing(null);
    reset(emptyValues);
    setOpen(true);
  };

  const openEdit = (record: ExperienceRecord) => {
    setEditing(record);
    reset(toValues(record));
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: (values: ExperienceFormValues) => {
      const payload = {
        organization: values.organization,
        jobTitle: values.jobTitle,
        startDate: values.startDate,
        endDate: values.isCurrent ? null : values.endDate,
        isCurrent: values.isCurrent,
        description: values.description,
      };
      return editing
        ? api.put<{ profile: StudentProfile }>(`/students/me/experiences/${editing.id}`, payload)
        : api.post<{ profile: StudentProfile }>('/students/me/experiences', payload);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(profileQueryKey, data.profile);
      queryClient.invalidateQueries({ queryKey: ['student'] });
      closeDialog();
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError)) {
        setError('organization', { type: 'server', message: errorMessage(error) });
      }
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete<{ profile: StudentProfile }>(`/students/me/experiences/${id}`),
    onSuccess: (data) => {
      queryClient.setQueryData(profileQueryKey, data.profile);
      queryClient.invalidateQueries({ queryKey: ['student'] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Internships, part-time work or freelance projects. Experience is optional — it is only checked for roles that ask for it.
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      {remove.isError ? <Alert tone="error">{errorMessage(remove.error)}</Alert> : null}

      {profile.experiences.length === 0 ? (
        <EmptyState title="No experience records yet" description="You can leave this empty if you have no prior experience." />
      ) : (
        <div className="space-y-3">
          {profile.experiences.map((record) => (
            <div key={record.id} className="rounded-md border border-border bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-navy-900">{record.jobTitle}</p>
                  <p className="text-sm text-muted-foreground">{record.organization}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {record.startDate} → {record.isCurrent ? 'Present' : record.endDate ?? '—'}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(record)} aria-label="Edit experience">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-red-50"
                    aria-label="Delete experience"
                    onClick={() => {
                      if (window.confirm('Delete this experience record?')) remove.mutate(record.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {record.description ? <p className="mt-2 text-sm text-navy-700">{record.description}</p> : null}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(value) => (value ? setOpen(true) : closeDialog())}>
        <DialogContent title={editing ? 'Edit experience' : 'Add experience'} description="Dates use the YYYY-MM format.">
          <form className="space-y-4" onSubmit={handleSubmit((values) => save.mutate(values))} noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Organisation" htmlFor="organization" error={errors.organization?.message} required>
                <Input id="organization" {...register('organization')} />
              </Field>
              <Field label="Job title" htmlFor="jobTitle" error={errors.jobTitle?.message} required>
                <Input id="jobTitle" {...register('jobTitle')} />
              </Field>
              <Field label="Start date" htmlFor="startDate" error={errors.startDate?.message} hint="YYYY-MM" required>
                <Input id="startDate" placeholder="2024-06" {...register('startDate')} />
              </Field>
              <Field label="End date" htmlFor="endDate" error={errors.endDate?.message} hint={isCurrent ? 'Not needed for a current role' : 'YYYY-MM'}>
                <Input id="endDate" placeholder="2025-01" disabled={isCurrent} {...register('endDate')} />
              </Field>
            </div>

            <label className="flex items-center gap-2 text-sm text-navy-800">
              <input type="checkbox" className="h-4 w-4 accent-navy-700" {...register('isCurrent')} />
              I currently work here
            </label>

            <Field label="Description" htmlFor="description" error={errors.description?.message}>
              <Textarea id="description" rows={3} {...register('description')} />
            </Field>

            {save.isError ? <Alert tone="error">{errorMessage(save.error)}</Alert> : null}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? <Spinner /> : null}
                {editing ? 'Save changes' : 'Add experience'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
