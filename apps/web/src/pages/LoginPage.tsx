import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { loginSchema } from '@campusconnect/shared';
import type { AuthUser } from '@campusconnect/shared';
import { Alert, Spinner } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { api, errorMessage } from '@/lib/api';
import { resolver } from '@/lib/form';
import { dashboardPathFor, meQueryKey } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

type LoginForm = { email: string; password: string };
type RoleTab = 'STUDENT' | 'EMPLOYER' | 'ADMIN';

const tabs: { value: RoleTab; label: string; hint: string }[] = [
  { value: 'STUDENT', label: 'Student', hint: 'Student portal' },
  { value: 'EMPLOYER', label: 'Employer', hint: 'Company portal' },
  { value: 'ADMIN', label: 'Administrator', hint: 'Placement cell' },
];

export const LoginPage = () => {
  const [role, setRole] = useState<RoleTab>('STUDENT');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<LoginForm>({ resolver: resolver<LoginForm>(loginSchema), defaultValues: { email: '', password: '' } });

  const mutation = useMutation({
    mutationFn: (values: LoginForm) => api.post<{ user: AuthUser }>('/auth/login', { ...values, role }),
    onSuccess: (data) => {
      queryClient.setQueryData(meQueryKey, data.user);
      navigate(dashboardPathFor(data.user.role), { replace: true });
    },
    onError: (error) => {
      setError('password', { type: 'server', message: errorMessage(error) });
    },
  });

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-12 sm:px-0">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold">Sign in to CampusConnect</h1>
        <p className="text-sm text-muted-foreground">Choose the account type you want to use.</p>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-white p-1">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setRole(tab.value)}
            className={cn(
              'rounded-md px-2 py-2 text-sm font-medium transition-colors',
              role === tab.value ? 'bg-navy-900 text-white' : 'text-navy-600 hover:bg-navy-50',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <form
        className="space-y-4 rounded-lg border border-border bg-white p-5"
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        noValidate
      >
        <Field label="Email address" htmlFor="email" error={errors.email?.message} required>
          <Input id="email" type="email" autoComplete="email" placeholder="you@college.edu" {...register('email')} />
        </Field>

        <Field label="Password" htmlFor="password" error={errors.password?.message} required>
          <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
        </Field>

        {mutation.isError && !errors.password ? <Alert tone="error">{errorMessage(mutation.error)}</Alert> : null}

        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? <Spinner /> : null}
          Sign in as {tabs.find((tab) => tab.value === role)?.label.toLowerCase()}
        </Button>

        <p className="text-center text-xs text-muted-foreground">{tabs.find((tab) => tab.value === role)?.hint}</p>
      </form>

      <div className="space-y-2 text-center text-sm text-muted-foreground">
        <p>
          New student?{' '}
          <Link to="/register/student" className="font-medium text-navy-700 hover:underline">
            Create an account
          </Link>
        </p>
        <p>
          Hiring from a company?{' '}
          <Link to="/register/employer" className="font-medium text-navy-700 hover:underline">
            Register your company
          </Link>
        </p>
        <p className="text-xs">
          Administrator accounts are created with the one-time bootstrap command, not through this page.
        </p>
      </div>
    </div>
  );
};
