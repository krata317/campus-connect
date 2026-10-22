import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { companyUpdateSchema } from '@campusconnect/shared';
import type { EmployerCompany } from '@campusconnect/shared';
import { Alert, ErrorState, LoadingState, PageHeader, Spinner } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/form';
import { api, errorMessage } from '@/lib/api';
import { applyFieldErrors, resolver } from '@/lib/form';
import { formatDate, statusLabel, statusTone } from '@/lib/utils';

type CompanyFormValues = {
  name: string;
  website: string;
  contactPersonName: string;
  contactPhone: string;
  contactEmail: string;
  description: string;
};

export const EmployerCompanyPage = () => {
  const queryClient = useQueryClient();

  const company = useQuery({
    queryKey: ['employer', 'company'],
    queryFn: () => api.get<EmployerCompany>('/employer/me/company'),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
    setError,
  } = useForm<CompanyFormValues>({ resolver: resolver<CompanyFormValues>(companyUpdateSchema) });

  useEffect(() => {
    if (!company.data) return;
    reset({
      name: company.data.company.name,
      website: company.data.company.website ?? '',
      contactPersonName: company.data.company.contactPersonName,
      contactPhone: company.data.company.contactPhone,
      contactEmail: company.data.company.contactEmail,
      description: company.data.company.description ?? '',
    });
  }, [company.data, reset]);

  const save = useMutation({
    mutationFn: (values: CompanyFormValues) => {
      const parsed = companyUpdateSchema.parse(values);
      return api.put<EmployerCompany>('/employer/me/company', parsed);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['employer', 'company'], data);
      queryClient.invalidateQueries({ queryKey: ['employer'] });
      reset({
        name: data.company.name,
        website: data.company.website ?? '',
        contactPersonName: data.company.contactPersonName,
        contactPhone: data.company.contactPhone,
        contactEmail: data.company.contactEmail,
        description: data.company.description ?? '',
      });
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError)) {
        setError('name', { type: 'server', message: errorMessage(error) });
      }
    },
  });

  if (company.isLoading) return <LoadingState label="Loading company profile" />;
  if (company.isError) return <ErrorState message={errorMessage(company.error)} onRetry={() => company.refetch()} />;

  const detail = company.data as EmployerCompany;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Company profile"
        description="These details are shown to the placement cell when they review your hiring requests."
        actions={<Badge variant={statusTone(detail.account.approvalStatus)}>{statusLabel(detail.account.approvalStatus)}</Badge>}
      />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Company details</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit((values) => save.mutate(values))} noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Company name" htmlFor="name" error={errors.name?.message} required>
                  <Input id="name" {...register('name')} />
                </Field>
                <Field label="Website" htmlFor="website" error={errors.website?.message}>
                  <Input id="website" placeholder="https://example.com" {...register('website')} />
                </Field>
                <Field label="Contact person" htmlFor="contactPersonName" error={errors.contactPersonName?.message} required>
                  <Input id="contactPersonName" {...register('contactPersonName')} />
                </Field>
                <Field label="Contact phone" htmlFor="contactPhone" error={errors.contactPhone?.message} required>
                  <Input id="contactPhone" {...register('contactPhone')} />
                </Field>
                <Field label="Company email" htmlFor="contactEmail" error={errors.contactEmail?.message} required>
                  <Input id="contactEmail" type="email" {...register('contactEmail')} />
                </Field>
              </div>

              <Field label="About the organisation" htmlFor="description" error={errors.description?.message}>
                <Textarea id="description" rows={4} {...register('description')} />
              </Field>

              {save.isError ? <Alert tone="error">{errorMessage(save.error)}</Alert> : null}
              {save.isSuccess ? <Alert tone="success">Company profile updated.</Alert> : null}

              <div className="flex justify-end">
                <Button type="submit" disabled={save.isPending || !isDirty}>
                  {save.isPending ? <Spinner /> : null}
                  Save changes
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Sign-in email</span>
              <span className="font-medium text-navy-900">{detail.account.email}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Approval status</span>
              <span className="font-medium text-navy-900">{statusLabel(detail.account.approvalStatus)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Registered</span>
              <span className="font-medium text-navy-900">{formatDate(detail.company.createdAt)}</span>
            </div>
            {detail.account.reviewedAt ? (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Reviewed</span>
                <span className="font-medium text-navy-900">{formatDate(detail.account.reviewedAt)}</span>
              </div>
            ) : null}
            {detail.account.reviewNote ? (
              <div className="space-y-1 border-t border-border pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Review note</p>
                <p className="text-sm text-navy-800">{detail.account.reviewNote}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
