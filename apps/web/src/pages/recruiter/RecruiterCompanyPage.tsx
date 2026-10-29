import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RecruiterProfile } from '@campusconnect/shared';
import { recruiterProfileSchema } from '@campusconnect/shared';
import { Alert, ErrorState, LoadingState, PageHeader } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Card, CardContent } from '@/components/ui/card';
import { api, errorMessage } from '@/lib/api';
import { applyFieldErrors, resolver } from '@/lib/form';

type CompanyForm = {
  companyName: string;
  website: string;
  contactPersonName: string;
  contactPhone: string;
  description: string;
};

export const RecruiterCompanyPage = () => {
  const queryClient = useQueryClient();

  const profile = useQuery({
    queryKey: ['recruiter', 'profile'],
    queryFn: () => api.get<RecruiterProfile>('/recruiter/profile'),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
    setError,
  } = useForm<CompanyForm>({
    resolver: resolver<CompanyForm>(recruiterProfileSchema),
    defaultValues: { companyName: '', website: '', contactPersonName: '', contactPhone: '', description: '' },
  });

  useEffect(() => {
    if (!profile.data) return;
    reset({
      companyName: profile.data.companyName,
      website: profile.data.website ?? '',
      contactPersonName: profile.data.contactPersonName,
      contactPhone: profile.data.contactPhone,
      description: profile.data.description ?? '',
    });
  }, [profile.data, reset]);

  const save = useMutation({
    mutationFn: (values: CompanyForm) =>
      api.put<RecruiterProfile>('/recruiter/profile', {
        companyName: values.companyName,
        website: values.website || null,
        contactPersonName: values.contactPersonName,
        contactPhone: values.contactPhone,
        description: values.description || null,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['recruiter', 'profile'], data);
      reset({ ...data, website: data.website ?? '', description: data.description ?? '' });
    },
    onError: (error) => applyFieldErrors(error, setError),
  });

  if (profile.isLoading) return <LoadingState label="Loading company profile" />;
  if (profile.isError) return <ErrorState message={errorMessage(profile.error)} onRetry={() => profile.refetch()} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Company profile"
        description="Shown to institutes when they review your hiring requests."
      />

      <Card>
        <CardContent className="pt-5">
          <form className="space-y-4" onSubmit={handleSubmit((values) => save.mutate(values))} noValidate>
            {save.isError ? <Alert tone="error">{errorMessage(save.error)}</Alert> : null}
            {save.isSuccess ? <Alert tone="success">Company profile saved.</Alert> : null}

            <Field
              label="Company name"
              htmlFor="companyName"
              error={errors.companyName?.message}
              hint="Company names are unique on Campus Connect."
              required
            >
              <Input id="companyName" {...register('companyName')} />
            </Field>

            <Field label="Website" htmlFor="website" error={errors.website?.message}>
              <Input id="website" placeholder="https://" {...register('website')} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Contact person" htmlFor="contactPersonName" error={errors.contactPersonName?.message} required>
                <Input id="contactPersonName" {...register('contactPersonName')} />
              </Field>
              <Field label="Contact phone" htmlFor="contactPhone" error={errors.contactPhone?.message} required>
                <Input id="contactPhone" {...register('contactPhone')} />
              </Field>
            </div>

            <Field label="About the company" htmlFor="description" error={errors.description?.message}>
              <Textarea id="description" {...register('description')} />
            </Field>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={save.isPending || !isDirty}>
                Save changes
              </Button>
              <p className="text-xs text-muted-foreground">Your sign-in email cannot be changed here.</p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
