import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import type { Role } from '@campusconnect/shared';
import { Alert, Spinner } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { AuthShell } from '@/components/shared/AuthShell';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

const accountTypes: { value: Role; label: string }[] = [
  { value: 'STUDENT', label: 'Student' },
  { value: 'RECRUITER', label: 'Recruiter' },
  { value: 'INSTITUTE_ADMIN', label: 'Institute' },
];

const isRole = (value: string | null): value is Role =>
  value === 'STUDENT' || value === 'RECRUITER' || value === 'INSTITUTE_ADMIN';

export const ForgotPasswordPage = () => {
  const [params] = useSearchParams();
  const initialRole = params.get('role');
  const [role, setRole] = useState<Role>(isRole(initialRole) ? initialRole : 'STUDENT');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<string | null>(null);

  const request = useMutation({
    mutationFn: () =>
      api.post<{ ok: boolean; message: string }>('/auth/password-reset/request', { email, role }),
    onSuccess: (data) => setSent(data.message),
  });

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Choose your account type, then enter the email address on that account."
      footer={
        <p>
          Remembered it?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      }
    >
      {sent ? (
        <div className="space-y-4">
          <Alert tone="success" title="Check your inbox">
            {sent}
          </Alert>
          <p className="text-sm text-muted-foreground">
            The link expires in 30 minutes and can be used once. If it does not arrive, check your spam folder before
            requesting another.
          </p>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            request.mutate();
          }}
        >
          {request.isError ? <Alert tone="error">{errorMessage(request.error)}</Alert> : null}

          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Account type</p>
            <div className="grid grid-cols-3 gap-1.5 rounded-lg border border-border bg-muted/60 p-1">
              {accountTypes.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRole(option.value)}
                  aria-pressed={role === option.value}
                  className={cn(
                    'rounded-md px-2 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    role === option.value
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <Field label="Email address" htmlFor="email" required>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoFocus
            />
          </Field>

          <Button type="submit" className="w-full" disabled={request.isPending || email.trim().length === 0}>
            {request.isPending ? <Spinner /> : null}
            Send reset link
          </Button>

          <p className="text-xs text-muted-foreground">
            For security we show the same confirmation whether or not an account exists.
          </p>
        </form>
      )}
    </AuthShell>
  );
};
