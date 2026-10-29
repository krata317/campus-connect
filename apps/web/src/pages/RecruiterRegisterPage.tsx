import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import type { RegistrationStartResult } from '@campusconnect/shared';
import { Alert, Spinner } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { AuthShell } from '@/components/shared/AuthShell';
import { api, errorMessage } from '@/lib/api';

type Step = 'details' | 'code' | 'sent';

/**
 * Recruiter sign-up. No institute is chosen here: a recruiter account is
 * independent and can send requests to any registered institute later.
 */
export const RecruiterRegisterPage = () => {
  const [step, setStep] = useState<Step>('details');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [pendingId, setPendingId] = useState('');
  const [otp, setOtp] = useState('');

  const start = useMutation({
    mutationFn: () => api.post<RegistrationStartResult>('/registrations/recruiter/start', { companyName, email }),
    onSuccess: (result) => {
      setPendingId(result.pendingId);
      setStep('code');
    },
  });

  const verify = useMutation({
    mutationFn: () => api.post('/registrations/recruiter/verify', { pendingId, code: otp }),
    onSuccess: () => setStep('sent'),
  });

  const resend = useMutation({
    mutationFn: () => api.post('/registrations/recruiter/resend', { pendingId }),
  });

  if (step === 'sent') {
    return (
      <AuthShell
        title="Check your email"
        subtitle={`We sent a registration link to ${email}.`}
        footer={
          <p>
            Wrong address?{' '}
            <button type="button" className="font-medium text-primary hover:underline" onClick={() => setStep('details')}>
              Start again
            </button>
          </p>
        }
      >
        <Alert tone="success" title="Email verified">
          Open the link from the email to choose your username and password. The link expires in one hour and can only be
          used once.
        </Alert>
      </AuthShell>
    );
  }

  if (step === 'code') {
    return (
      <AuthShell
        title="Enter the verification code"
        subtitle={`We sent a 6-digit code to ${email}.`}
        footer={
          <p>
            Wrong address?{' '}
            <button type="button" className="font-medium text-primary hover:underline" onClick={() => setStep('details')}>
              Start again
            </button>
          </p>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            verify.mutate();
          }}
        >
          {verify.isError ? <Alert tone="error">{errorMessage(verify.error)}</Alert> : null}
          {resend.isSuccess ? <Alert tone="success">A new code is on its way.</Alert> : null}
          {resend.isError ? <Alert tone="error">{errorMessage(resend.error)}</Alert> : null}

          <Field label="Verification code" htmlFor="otp" required>
            <Input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
              className="text-center text-lg tracking-[0.4em]"
              autoFocus
            />
          </Field>

          <Button type="submit" className="w-full" disabled={verify.isPending || otp.length !== 6}>
            {verify.isPending ? <Spinner /> : null}
            Verify email
          </Button>

          <Button type="button" variant="ghost" className="w-full" disabled={resend.isPending} onClick={() => resend.mutate()}>
            Resend code
          </Button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Register as a recruiter"
      subtitle="One account for every institute you hire from. We verify your company email before creating the account."
      footer={
        <p>
          Already registered?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          start.mutate();
        }}
      >
        {start.isError ? <Alert tone="error">{errorMessage(start.error)}</Alert> : null}

        <Field
          label="Company name"
          htmlFor="companyName"
          hint="Company names are unique on Campus Connect, so use the name your company is known by."
          required
        >
          <Input id="companyName" value={companyName} onChange={(event) => setCompanyName(event.target.value)} autoFocus />
        </Field>

        <Field label="Contact email" htmlFor="email" hint="We send the verification code and registration link here." required>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>

        <Button type="submit" className="w-full" disabled={start.isPending}>
          {start.isPending ? <Spinner /> : null}
          Send verification code
        </Button>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Email verification confirms access to this mailbox. It does not establish legal ownership of the company.
        </p>
      </form>
    </AuthShell>
  );
};
