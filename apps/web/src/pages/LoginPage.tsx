import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AuthUser, Role } from '@campusconnect/shared';
import { loginSchema } from '@campusconnect/shared';
import { Alert, Spinner } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { AuthShell } from '@/components/shared/AuthShell';
import { api, ApiError, errorMessage } from '@/lib/api';
import { applyFieldErrors, resolver } from '@/lib/form';
import { dashboardPathFor, meQueryKey } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

type RoleTab = 'STUDENT' | 'RECRUITER' | 'INSTITUTE_ADMIN';

type LoginForm = { identifier: string; password: string; rememberMe?: boolean };

const tabs: { value: RoleTab; label: string; hint: string }[] = [
  { value: 'STUDENT', label: 'Student', hint: 'Email and password' },
  { value: 'RECRUITER', label: 'Recruiter', hint: 'Email or username' },
  { value: 'INSTITUTE_ADMIN', label: 'Institute', hint: 'Email or username' },
];

export const LoginPage = () => {
  const [role, setRole] = useState<RoleTab>('STUDENT');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const expired = params.get('expired') === '1';

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<LoginForm>({
    resolver: resolver<LoginForm>(loginSchema.omit({ role: true })),
    defaultValues: { identifier: '', password: '', rememberMe: false },
  });

  const mutation = useMutation({
    mutationFn: (values: LoginForm) =>
      api.post<{ user: AuthUser }>('/auth/login', {
        identifier: values.identifier,
        password: values.password,
        role: role as Role,
        rememberMe: values.rememberMe ?? false,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(meQueryKey, data.user);
      navigate(dashboardPathFor(data.user.role), { replace: true });
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError)) {
        // Non-field errors are shown above the form.
      }
    },
  });

  const onSubmit = (values: LoginForm) => mutation.mutate(values);

  return (
    <AuthShell
      title="Sign in"
      subtitle="Use the portal that matches your account."
      footer={
        <div className="space-y-2">
          <p>
            New here?{' '}
            <Link to="/register/student" className="font-medium text-primary hover:underline">
              Student
            </Link>
            {' · '}
            <Link to="/register/recruiter" className="font-medium text-primary hover:underline">
              Recruiter
            </Link>
            {' · '}
            <Link to="/register/institute" className="font-medium text-primary hover:underline">
              Institute
            </Link>
          </p>
          <p className="text-xs">Institute administrators are created only through the verified registration flow.</p>
        </div>
      }
    >
      <div className="mb-5 grid grid-cols-3 gap-1.5 rounded-lg border border-border bg-muted/60 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setRole(tab.value)}
            aria-pressed={role === tab.value}
            className={cn(
              'rounded-md px-2 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              role === tab.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        {expired ? (
          <Alert tone="info" title="You were signed out">
            Your session ended. Sign in again to continue — tick “Remember me” to stay signed in for 7 days.
          </Alert>
        ) : null}

        {mutation.isError && !(mutation.error instanceof ApiError && mutation.error.fieldErrors.length > 0) ? (
          <Alert tone="error">{errorMessage(mutation.error)}</Alert>
        ) : null}

        <Field
          label={role === 'STUDENT' ? 'Email address' : 'Email or username'}
          htmlFor="identifier"
          error={errors.identifier?.message}
          hint={role === 'STUDENT' ? undefined : tabs.find((tab) => tab.value === role)?.hint}
          required
        >
          <Input id="identifier" autoComplete="username" autoFocus {...register('identifier')} />
        </Field>

        <Field label="Password" htmlFor="password" error={errors.password?.message} required>
          <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label htmlFor="rememberMe" className="flex items-center gap-2 text-sm text-foreground">
            <input
              id="rememberMe"
              type="checkbox"
              className="h-4 w-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              {...register('rememberMe')}
            />
            Remember me for 7 days
          </label>
          <Link to={`/forgot-password?role=${role}`} className="text-sm font-medium text-primary hover:underline">
            Forgot password?
          </Link>
        </div>

        <p className="text-xs text-muted-foreground">
          Without “Remember me” you are signed out automatically after 10 minutes.
        </p>

        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? <Spinner /> : null}
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
};
