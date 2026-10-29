import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Alert, Spinner } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { AuthShell } from '@/components/shared/AuthShell';
import { api, errorMessage } from '@/lib/api';

export const ResetPasswordPage = () => {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);

  const complete = useMutation({
    mutationFn: () => api.post('/auth/password-reset/complete', { token, password }),
    onSuccess: () => setDone(true),
  });

  if (!token) {
    return (
      <AuthShell title="Reset link missing" subtitle="Open the link from your email exactly as it was sent.">
        <Link to="/forgot-password" className="text-sm font-medium text-primary hover:underline">
          Request a new link
        </Link>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell
        title="Password updated"
        subtitle="You can now sign in with your new password."
        footer={
          <Link to="/login" className="font-medium text-primary hover:underline">
            Go to sign in
          </Link>
        }
      >
        <Alert tone="success">Your password has been changed. This link can no longer be used.</Alert>
      </AuthShell>
    );
  }

  const mismatch = confirm.length > 0 && confirm !== password;

  return (
    <AuthShell title="Choose a new password" subtitle="At least 8 characters.">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (password !== confirm) return;
          complete.mutate();
        }}
      >
        {complete.isError ? <Alert tone="error">{errorMessage(complete.error)}</Alert> : null}

        <Field label="New password" htmlFor="password" required>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            autoFocus
          />
        </Field>

        <Field label="Confirm password" htmlFor="confirm" error={mismatch ? 'The passwords do not match' : undefined} required>
          <Input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
          />
        </Field>

        <Button type="submit" className="w-full" disabled={complete.isPending || password.length < 8 || mismatch}>
          {complete.isPending ? <Spinner /> : null}
          Update password
        </Button>
      </form>
    </AuthShell>
  );
};
