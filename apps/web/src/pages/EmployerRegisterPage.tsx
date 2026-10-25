import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { employerRegisterSchema } from '@campusconnect/shared';
import type { AuthUser } from '@campusconnect/shared';
import { Alert, Spinner } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { CollegeSelect } from '@/components/shared/CollegeSelect';
import { api, errorMessage } from '@/lib/api';
import { applyFieldErrors, resolver } from '@/lib/form';
import { dashboardPathFor, meQueryKey } from '@/hooks/useAuth';

type EmployerRegisterForm = {
  companyName: string;
  website: string;
  contactPersonName: string;
  contactPhone: string;
  companyEmail: string;
  email: string;
  password: string;
  confirmPassword: string;
  description: string;
  collegeSlug: string;
};

export const EmployerRegisterPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<EmployerRegisterForm>({
    resolver: resolver<EmployerRegisterForm>(employerRegisterSchema),
    defaultValues: {
      companyName: '',
      website: '',
      contactPersonName: '',
      contactPhone: '',
      companyEmail: '',
      email: '',
      password: '',
      confirmPassword: '',
      description: '',
      collegeSlug: '',
    },
  });

  const mutation = useMutation({
    mutationFn: (values: EmployerRegisterForm) => {
      const { confirmPassword, ...formValues } = values;
      const parsed = employerRegisterSchema.parse(formValues);
      return api.post<{ user: AuthUser }>('/auth/register/employer', {
        email: parsed.email,
        password: parsed.password,
        companyName: parsed.companyName,
        website: parsed.website ?? null,
        contactPersonName: parsed.contactPersonName,
        contactPhone: parsed.contactPhone,
        companyEmail: parsed.companyEmail,
        description: parsed.description ?? null,
        collegeSlug: parsed.collegeSlug,
      });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(meQueryKey, data.user);
      navigate(dashboardPathFor(data.user.role), { replace: true });
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError)) {
        setError('email', { type: 'server', message: errorMessage(error) });
      }
    },
  });

  const onSubmit = (values: EmployerRegisterForm) => {
    mutation.mutate(values);
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12 sm:px-0">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Register as a recruiter</h1>
        <p className="text-sm text-muted-foreground">
          Choose the college you are hiring from, then add your company details. A placement administrator reviews every
          recruiter before hiring requests can be submitted; you can sign in and review your profile while the account is
          pending.
        </p>
      </div>

      <form className="space-y-5 rounded-lg border border-border bg-white p-5" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Field
          label="Hiring from college"
          htmlFor="collegeSlug"
          error={errors.collegeSlug?.message}
          hint="Your account only reaches this college's students and hiring requests."
          required
        >
          <CollegeSelect id="collegeSlug" {...register('collegeSlug')} />
        </Field>

        <div>
          <h2 className="text-sm font-semibold text-navy-900">Company</h2>
          <p className="text-xs text-muted-foreground">Details shown to the placement cell.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name" htmlFor="companyName" error={errors.companyName?.message} required>
            <Input id="companyName" {...register('companyName')} />
          </Field>
          <Field label="Website" htmlFor="website" error={errors.website?.message} hint="Optional, include https://">
            <Input id="website" placeholder="https://example.com" {...register('website')} />
          </Field>
        </div>

        <Field label="Company email" htmlFor="companyEmail" error={errors.companyEmail?.message} required>
          <Input id="companyEmail" type="email" placeholder="careers@example.com" {...register('companyEmail')} />
        </Field>

        <Field label="About the organisation" htmlFor="description" error={errors.description?.message} hint="Optional">
          <Textarea id="description" rows={3} {...register('description')} />
        </Field>

        <div className="border-t border-border pt-4">
          <h2 className="text-sm font-semibold text-navy-900">Contact person</h2>
          <p className="text-xs text-muted-foreground">Who the placement cell should contact about this account.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact name" htmlFor="contactPersonName" error={errors.contactPersonName?.message} required>
            <Input id="contactPersonName" {...register('contactPersonName')} />
          </Field>
          <Field label="Contact phone" htmlFor="contactPhone" error={errors.contactPhone?.message} required>
            <Input id="contactPhone" {...register('contactPhone')} />
          </Field>
        </div>

        <div className="border-t border-border pt-4">
          <h2 className="text-sm font-semibold text-navy-900">Sign-in details</h2>
          <p className="text-xs text-muted-foreground">Used to access the employer portal.</p>
        </div>

        <Field label="Account email" htmlFor="email" error={errors.email?.message} required>
          <Input id="email" type="email" autoComplete="email" {...register('email')} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Password" htmlFor="password" error={errors.password?.message} hint="At least 8 characters" required>
            <Input id="password" type="password" autoComplete="new-password" {...register('password')} />
          </Field>
          <Field label="Confirm password" htmlFor="confirmPassword" error={errors.confirmPassword?.message} required>
            <Input id="confirmPassword" type="password" autoComplete="new-password" {...register('confirmPassword')} />
          </Field>
        </div>

        {mutation.isError ? <Alert tone="error">{errorMessage(mutation.error)}</Alert> : null}

        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? <Spinner /> : null}
          Register as a recruiter
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already registered?{' '}
        <Link to="/login" className="font-medium text-navy-700 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
};
