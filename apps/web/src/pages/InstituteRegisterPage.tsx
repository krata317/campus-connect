import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import type { InstitutionLookup, RegistrationStartResult } from '@campusconnect/shared';
import { Alert, Spinner } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { AuthShell } from '@/components/shared/AuthShell';
import { api, errorMessage } from '@/lib/api';

type Step = 'details' | 'code' | 'sent';

/**
 * Institute sign-up in two steps: the AISHE code is checked against the bundled
 * directory first, then the contact mailbox is verified with a one-time code.
 * Nothing is created until the emailed single-use link is completed.
 */
export const InstituteRegisterPage = () => {
  const [step, setStep] = useState<Step>('details');
  const [aisheCode, setAisheCode] = useState('');
  const [email, setEmail] = useState('');
  const [pendingId, setPendingId] = useState('');
  const [otp, setOtp] = useState('');
  const [lookup, setLookup] = useState<InstitutionLookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Show the official record as soon as a complete-looking code is typed.
  useEffect(() => {
    const code = aisheCode.trim();
    if (code.length < 4) {
      setLookup(null);
      setLookupError(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .get<{ institution: InstitutionLookup | null }>(`/registrations/institutions/lookup?code=${encodeURIComponent(code)}`)
        .then((result) => {
          if (cancelled) return;
          setLookup(result.institution);
          setLookupError(result.institution ? null : 'No institution matches that AISHE code.');
        })
        .catch(() => {
          if (!cancelled) setLookupError('Could not check that code right now.');
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [aisheCode]);

  const start = useMutation({
    mutationFn: () => api.post<RegistrationStartResult>('/registrations/institute/start', { aisheCode, email }),
    onSuccess: (result) => {
      setPendingId(result.pendingId);
      setStep('code');
    },
  });

  const verify = useMutation({
    mutationFn: () => api.post('/registrations/institute/verify', { pendingId, code: otp }),
    onSuccess: () => setStep('sent'),
  });

  const resend = useMutation({
    mutationFn: () => api.post('/registrations/institute/resend', { pendingId }),
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
          Open the link from the email to choose your administrator username and password. The link expires in one hour
          and can only be used once.
        </Alert>
        <p className="mt-4 text-sm text-muted-foreground">
          Nothing has been created yet. The institute only exists after you complete the form behind that link.
        </p>
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

          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={resend.isPending}
            onClick={() => resend.mutate()}
          >
            Resend code
          </Button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Register your institute"
      subtitle="We check your AISHE code against the official institution directory, then verify your contact email."
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
          label="AISHE code"
          htmlFor="aisheCode"
          hint="Printed on your AISHE certificate, for example C-6560."
          required
        >
          <Input
            id="aisheCode"
            value={aisheCode}
            onChange={(event) => setAisheCode(event.target.value.toUpperCase())}
            placeholder="C-6560"
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            autoFocus
          />
        </Field>

        {lookup ? (
          <div className="rounded-md border border-border bg-muted/60 px-3 py-2.5 text-sm">
            <p className="font-medium text-foreground">{lookup.name}</p>
            <p className="text-xs text-muted-foreground">
              {lookup.district}, {lookup.state} · {lookup.aisheCode}
            </p>
          </div>
        ) : lookupError ? (
          <p className="text-xs font-medium text-destructive">{lookupError}</p>
        ) : null}

        <Field
          label="Contact email"
          htmlFor="email"
          hint="Use a mailbox your placement cell can access. We send the verification code and the registration link here."
          required
        >
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>

        <Button type="submit" className="w-full" disabled={start.isPending || !lookup}>
          {start.isPending ? <Spinner /> : null}
          Send verification code
        </Button>

        <p className="text-xs leading-relaxed text-muted-foreground">
          An AISHE code confirms the institute exists in the directory. The email code confirms access to that mailbox.
          Neither proves authority to act for the institute.
        </p>
      </form>
    </AuthShell>
  );
};
