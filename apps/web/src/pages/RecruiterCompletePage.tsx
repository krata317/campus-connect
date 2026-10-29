import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { RegistrationLinkInfo } from '@campusconnect/shared';
import { Alert, Spinner } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { AuthShell } from '@/components/shared/AuthShell';
import { api, errorMessage } from '@/lib/api';

export const RecruiterCompletePage = () => {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [contactPersonName, setContactPersonName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [website, setWebsite] = useState('');
  const [description, setDescription] = useState('');
  const [result, setResult] = useState<{ companyName: string; emailSent: boolean } | null>(null);

  const info = useQuery({
    queryKey: ['registration', 'link', token],
    queryFn: () => api.get<RegistrationLinkInfo>(`/registrations/link?token=${encodeURIComponent(token)}`),
    enabled: token.length > 20,
    retry: false,
  });

  const complete = useMutation({
    mutationFn: () =>
      api.post<{ companyName: string; emailSent: boolean }>('/registrations/recruiter/complete', {
        token,
        contactPersonName,
        contactPhone,
        username,
        password,
        website: website || null,
        description: description || null,
      }),
    onSuccess: (data) => setResult(data),
  });

  if (!token) {
    return (
      <AuthShell title="Registration link missing" subtitle="Open the link from your email exactly as it was sent.">
        <Link to="/register/recruiter" className="text-sm font-medium text-primary hover:underline">
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
        <Link to="/register/recruiter" className="text-sm font-medium text-primary hover:underline">
          Start the registration again
        </Link>
      </AuthShell>
    );
  }

  if (result) {
    return (
      <AuthShell
        title="Recruiter account created"
        subtitle={`${result.companyName} can now send hiring requests to any registered institute.`}
        footer={
          <Link to="/login" className="font-medium text-primary hover:underline">
            Go to sign in
          </Link>
        }
      >
        <Alert tone="success" title="You can sign in now">
          Use your username or email with the password you just chose.
        </Alert>
        {result.emailSent ? null : (
          <p className="mt-3 text-xs text-muted-foreground">The confirmation email could not be sent.</p>
        )}
      </AuthShell>
    );
  }

  const data = info.data as RegistrationLinkInfo;

  return (
    <AuthShell title="Finish your recruiter registration" subtitle={`${data.companyName ?? 'Your company'} · ${data.email}`} wide>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          complete.mutate();
        }}
      >
        {complete.isError ? <Alert tone="error">{errorMessage(complete.error)}</Alert> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact person" htmlFor="contactPersonName" required>
            <Input
              id="contactPersonName"
              value={contactPersonName}
              onChange={(event) => setContactPersonName(event.target.value)}
              autoComplete="name"
            />
          </Field>
          <Field label="Contact phone" htmlFor="contactPhone" required>
            <Input id="contactPhone" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Username" htmlFor="username" hint="Used to sign in." required>
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
        </div>

        <Field label="Company website" htmlFor="website" hint="Optional">
          <Input id="website" value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://" />
        </Field>

        <Field label="About the company" htmlFor="description" hint="Optional. Shown to institutes when they review your requests.">
          <Textarea id="description" value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>

        <Button type="submit" className="w-full" disabled={complete.isPending}>
          {complete.isPending ? <Spinner /> : null}
          Create recruiter account
        </Button>
      </form>
    </AuthShell>
  );
};
