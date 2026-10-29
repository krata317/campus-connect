import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { RegistrationLinkInfo } from '@campusconnect/shared';
import { Alert, Spinner } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { AuthShell } from '@/components/shared/AuthShell';
import { api, errorMessage } from '@/lib/api';

export const InstituteCompletePage = () => {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [result, setResult] = useState<{ instituteName: string; studentCode: string; emailSent: boolean } | null>(null);

  const info = useQuery({
    queryKey: ['registration', 'link', token],
    queryFn: () => api.get<RegistrationLinkInfo>(`/registrations/link?token=${encodeURIComponent(token)}`),
    enabled: token.length > 20,
    retry: false,
  });

  const complete = useMutation({
    mutationFn: () =>
      api.post<{ instituteName: string; studentCode: string; emailSent: boolean }>('/registrations/institute/complete', {
        token,
        fullName,
        username,
        password,
        contactPhone: contactPhone || null,
        website: website || null,
      }),
    onSuccess: (data) => setResult(data),
  });

  if (!token) {
    return (
      <AuthShell title="Registration link missing" subtitle="Open the link from your email exactly as it was sent.">
        <Link to="/register/institute" className="text-sm font-medium text-primary hover:underline">
          Start the registration again
        </Link>
      </AuthShell>
    );
  }

  if (info.isLoading) {
    return (
      <AuthShell title="Checking your link">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Validating…
        </div>
      </AuthShell>
    );
  }

  if (info.isError) {
    return (
      <AuthShell title="This link cannot be used" subtitle={errorMessage(info.error)}>
        <Link to="/register/institute" className="text-sm font-medium text-primary hover:underline">
          Start the registration again
        </Link>
      </AuthShell>
    );
  }

  if (result) {
    return (
      <AuthShell
        title={`${result.instituteName} is registered`}
        subtitle={`Signed in as ${username}. Keep the student code below — you will need to share it with your students.`}
        footer={
          <Link to="/login" className="font-medium text-primary hover:underline">
            Go to sign in
          </Link>
        }
      >
        <div className="rounded-md border border-border bg-muted/60 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Institute student code</p>
          <p className="mt-1 break-all font-mono text-sm text-foreground">{result.studentCode}</p>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          You can view or rotate this code at any time from institute settings. Rotating it only affects future student
          registrations.
        </p>
        {result.emailSent ? (
          <p className="mt-2 text-xs text-muted-foreground">A confirmation email is on its way.</p>
        ) : (
          <Alert tone="warning" title="Confirmation email could not be sent">
            Your institute was created, but the email failed. The code above is the only copy — save it now.
          </Alert>
        )}
      </AuthShell>
    );
  }

  const data = info.data as RegistrationLinkInfo;

  return (
    <AuthShell
      title="Finish your institute registration"
      subtitle={`${data.instituteName ?? 'Your institute'} · ${data.email}`}
      wide
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          complete.mutate();
        }}
      >
        {complete.isError ? <Alert tone="error">{errorMessage(complete.error)}</Alert> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your full name" htmlFor="fullName" required>
            <Input id="fullName" value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" />
          </Field>
          <Field label="Contact phone" htmlFor="contactPhone" hint="Optional">
            <Input id="contactPhone" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} />
          </Field>
        </div>

        <Field label="Administrator username" htmlFor="username" hint="Used to sign in. Lowercase letters, numbers, dots, underscores or hyphens." required>
          <Input
            id="username"
            value={username}
            onChange={(event) => setUsername(event.target.value.toLowerCase())}
            autoComplete="username"
          />
        </Field>

        <Field label="Password" htmlFor="password" hint="At least 8 characters." required>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />
        </Field>

        <Field label="Institute website" htmlFor="website" hint="Optional">
          <Input id="website" value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://" />
        </Field>

        <Button type="submit" className="w-full" disabled={complete.isPending}>
          {complete.isPending ? <Spinner /> : null}
          Create institute account
        </Button>

        <p className="text-xs leading-relaxed text-muted-foreground">
          On completion we generate the shared student verification code for your institute and email it to {data.email}.
        </p>
      </form>
    </AuthShell>
  );
};
