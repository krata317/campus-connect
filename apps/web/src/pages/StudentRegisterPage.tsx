import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthUser, InstituteSummary } from '@campusconnect/shared';
import { studentRegisterSchema } from '@campusconnect/shared';
import { Alert, Spinner } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { AuthShell } from '@/components/shared/AuthShell';
import { api, errorMessage } from '@/lib/api';
import { applyFieldErrors, resolver } from '@/lib/form';
import { dashboardPathFor, meQueryKey } from '@/hooks/useAuth';

type StudentRegisterForm = {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  instituteId: string;
  studentCode: string;
};

export const StudentRegisterPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const institutes = useQuery({
    queryKey: ['institutes', 'public'],
    queryFn: () => api.get<{ items: InstituteSummary[] }>('/institutes').then((response) => response.items),
    staleTime: 60_000,
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<StudentRegisterForm>({
    resolver: resolver<StudentRegisterForm>(studentRegisterSchema),
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '', instituteId: '', studentCode: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: StudentRegisterForm) => {
      const parsed = studentRegisterSchema.parse({
        fullName: values.fullName,
        email: values.email,
        password: values.password,
        instituteId: values.instituteId,
        studentCode: values.studentCode,
      });
      return api.post<{ user: AuthUser }>('/auth/register/student', {
        fullName: parsed.fullName,
        email: parsed.email,
        password: parsed.password,
        instituteId: parsed.instituteId,
        studentCode: parsed.studentCode,
      });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(meQueryKey, data.user);
      navigate(dashboardPathFor(data.user.role), { replace: true });
    },
    onError: (error) => {
      applyFieldErrors(error, setError);
    },
  });

  const onSubmit = (values: StudentRegisterForm) => mutation.mutate(values);
  const list = institutes.data ?? [];

  return (
    <AuthShell
      title="Create your student account"
      subtitle="Ask your placement cell for the institute student code — you need it to register."
      footer={
        <p>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        {mutation.isError ? <Alert tone="error">{errorMessage(mutation.error)}</Alert> : null}

        <Field label="Institute" htmlFor="instituteId" error={errors.instituteId?.message} required>
          {institutes.isLoading ? (
            <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm text-muted-foreground">
              <Spinner /> Loading institutes
            </div>
          ) : list.length === 0 ? (
            <Alert tone="warning" title="No institute is registered yet">
              Your placement cell has to register the institute first.
            </Alert>
          ) : (
            <Select id="instituteId" defaultValue="" required {...register('instituteId')}>
              <option value="" disabled>
                Select your institute
              </option>
              {list.map((institute) => (
                <option key={institute.id} value={institute.id}>
                  {institute.name} · {institute.state}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field
          label="Institute student code"
          htmlFor="studentCode"
          error={errors.studentCode?.message}
          hint="32 characters, shared by your placement cell. Rotating it later does not affect your account."
          required
        >
          <Input id="studentCode" autoComplete="off" spellCheck={false} className="font-mono" {...register('studentCode')} />
        </Field>

        <Field label="Full name" htmlFor="fullName" error={errors.fullName?.message} required>
          <Input id="fullName" autoComplete="name" {...register('fullName')} />
        </Field>

        <Field label="Email address" htmlFor="email" error={errors.email?.message} required>
          <Input id="email" type="email" autoComplete="email" {...register('email')} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Password" htmlFor="password" error={errors.password?.message} required>
            <Input id="password" type="password" autoComplete="new-password" {...register('password')} />
          </Field>
          <Field label="Confirm password" htmlFor="confirmPassword" error={errors.confirmPassword?.message} required>
            <Input id="confirmPassword" type="password" autoComplete="new-password" {...register('confirmPassword')} />
          </Field>
        </div>

        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? <Spinner /> : null}
          Create account
        </Button>
      </form>
    </AuthShell>
  );
};
