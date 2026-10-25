import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { studentRegisterSchema } from '@campusconnect/shared';
import type { AuthUser } from '@campusconnect/shared';
import { Alert, Spinner } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { CollegeSelect } from '@/components/shared/CollegeSelect';
import { api, errorMessage } from '@/lib/api';
import { applyFieldErrors, resolver } from '@/lib/form';
import { dashboardPathFor, meQueryKey } from '@/hooks/useAuth';

type StudentRegisterForm = {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  dateOfBirth: string;
  collegeSlug: string;
};

export const StudentRegisterPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<StudentRegisterForm>({
    resolver: resolver<StudentRegisterForm>(studentRegisterSchema),
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '', dateOfBirth: '', collegeSlug: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: StudentRegisterForm) => {
      const { confirmPassword, ...formValues } = values;
      const parsed = studentRegisterSchema.parse(formValues);
      return api.post<{ user: AuthUser }>('/auth/register/student', {
        fullName: parsed.fullName,
        email: parsed.email,
        password: parsed.password,
        dateOfBirth: parsed.dateOfBirth ?? null,
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

  const onSubmit = (values: StudentRegisterForm) => {
    mutation.mutate(values);
  };

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-12 sm:px-0">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Create your student account</h1>
        <p className="text-sm text-muted-foreground">
          Choose your college, then add a name, email and password. You can complete the rest of your profile after signing
          in.
        </p>
      </div>

      <form className="space-y-4 rounded-lg border border-border bg-white p-5" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Field
          label="College"
          htmlFor="collegeSlug"
          error={errors.collegeSlug?.message}
          hint="Your account is linked to this college. Only this college's placement cell can see your profile."
          required
        >
          <CollegeSelect id="collegeSlug" {...register('collegeSlug')} />
        </Field>

        <Field label="Full name" htmlFor="fullName" error={errors.fullName?.message} required>
          <Input id="fullName" autoComplete="name" placeholder="As printed on your college record" {...register('fullName')} />
        </Field>

        <Field label="Email address" htmlFor="email" error={errors.email?.message} required>
          <Input id="email" type="email" autoComplete="email" placeholder="you@college.edu" {...register('email')} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Password" htmlFor="password" error={errors.password?.message} hint="At least 8 characters" required>
            <Input id="password" type="password" autoComplete="new-password" {...register('password')} />
          </Field>
          <Field label="Confirm password" htmlFor="confirmPassword" error={errors.confirmPassword?.message} required>
            <Input id="confirmPassword" type="password" autoComplete="new-password" {...register('confirmPassword')} />
          </Field>
        </div>

        <Field label="Date of birth" htmlFor="dateOfBirth" error={errors.dateOfBirth?.message} hint="Optional — used for placement records">
          <Input id="dateOfBirth" type="date" {...register('dateOfBirth')} />
        </Field>

        {mutation.isError ? <Alert tone="error">{errorMessage(mutation.error)}</Alert> : null}

        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? <Spinner /> : null}
          Create account
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
