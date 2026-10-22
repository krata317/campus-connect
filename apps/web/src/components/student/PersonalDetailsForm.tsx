import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { profileUpdateSchema } from '@campusconnect/shared';
import type { StudentProfile } from '@campusconnect/shared';
import { Alert, Spinner } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { api, errorMessage } from '@/lib/api';
import { applyFieldErrors, resolver } from '@/lib/form';
import { profileQueryKey } from '@/hooks/useStudent';

type ProfileFormValues = {
  fullName: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
  city: string;
  state: string;
  linkedin: string;
  github: string;
  portfolio: string;
  activeBacklogs: string;
};

const toValues = (profile: StudentProfile): ProfileFormValues => ({
  fullName: profile.fullName,
  dateOfBirth: profile.dateOfBirth ?? '',
  gender: profile.gender ?? '',
  phone: profile.phone ?? '',
  city: profile.city ?? '',
  state: profile.state ?? '',
  linkedin: profile.linkedin ?? '',
  github: profile.github ?? '',
  portfolio: profile.portfolio ?? '',
  activeBacklogs: profile.activeBacklogs === null ? '' : String(profile.activeBacklogs),
});

export const PersonalDetailsForm = ({ profile }: { profile: StudentProfile }) => {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
    setError,
  } = useForm<ProfileFormValues>({
    resolver: resolver<ProfileFormValues>(profileUpdateSchema),
    defaultValues: toValues(profile),
  });

  useEffect(() => {
    reset(toValues(profile));
  }, [profile, reset]);

  const mutation = useMutation({
    mutationFn: (values: ProfileFormValues) => {
      const parsed = profileUpdateSchema.parse(values);
      return api.put<{ profile: StudentProfile }>('/students/me/profile', parsed);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(profileQueryKey, data.profile);
      queryClient.invalidateQueries({ queryKey: ['student'] });
      reset(toValues(data.profile));
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError)) {
        setError('fullName', { type: 'server', message: errorMessage(error) });
      }
    },
  });

  return (
    <form className="space-y-5" onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="fullName" error={errors.fullName?.message} required>
          <Input id="fullName" {...register('fullName')} />
        </Field>
        <Field label="Date of birth" htmlFor="dateOfBirth" error={errors.dateOfBirth?.message}>
          <Input id="dateOfBirth" type="date" {...register('dateOfBirth')} />
        </Field>
        <Field label="Gender" htmlFor="gender" error={errors.gender?.message}>
          <Select id="gender" {...register('gender')}>
            <option value="">Prefer not to say</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
            <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
          </Select>
        </Field>
        <Field label="Phone number" htmlFor="phone" error={errors.phone?.message}>
          <Input id="phone" inputMode="tel" {...register('phone')} />
        </Field>
        <Field label="City" htmlFor="city" error={errors.city?.message}>
          <Input id="city" {...register('city')} />
        </Field>
        <Field label="State" htmlFor="state" error={errors.state?.message}>
          <Input id="state" {...register('state')} />
        </Field>
      </div>

      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-navy-900">External links</h3>
        <p className="text-xs text-muted-foreground">Full URLs only, including https://</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="LinkedIn" htmlFor="linkedin" error={errors.linkedin?.message}>
          <Input id="linkedin" placeholder="https://linkedin.com/in/…" {...register('linkedin')} />
        </Field>
        <Field label="GitHub" htmlFor="github" error={errors.github?.message}>
          <Input id="github" placeholder="https://github.com/…" {...register('github')} />
        </Field>
        <Field label="Portfolio" htmlFor="portfolio" error={errors.portfolio?.message}>
          <Input id="portfolio" placeholder="https://…" {...register('portfolio')} />
        </Field>
      </div>

      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-navy-900">Placement eligibility</h3>
        <p className="text-xs text-muted-foreground">
          Enter 0 if you have no active backlogs. Leaving this empty means "not reported", which can make you ineligible for
          roles that check backlogs.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Active backlogs" htmlFor="activeBacklogs" error={errors.activeBacklogs?.message}>
          <Input id="activeBacklogs" type="number" min={0} max={60} {...register('activeBacklogs')} />
        </Field>
      </div>

      {mutation.isError ? <Alert tone="error">{errorMessage(mutation.error)}</Alert> : null}
      {mutation.isSuccess ? <Alert tone="success">Personal details saved.</Alert> : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending || !isDirty}>
          {mutation.isPending ? <Spinner /> : null}
          Save personal details
        </Button>
      </div>
    </form>
  );
};
