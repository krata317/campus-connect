import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, ShieldAlert, Trash2 } from 'lucide-react';
import type { AuthUser } from '@campusconnect/shared';
import { Alert, LoadingState, PageHeader, Spinner } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/form';
import { api, errorMessage } from '@/lib/api';
import { meQueryKey, useCurrentUser } from '@/hooks/useAuth';

interface InstituteSettings {
  id: string;
  aisheCode: string;
  name: string;
  state: string;
  district: string;
  website: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  studentCodeUpdatedAt: string | null;
}

const roleLabel = (role: string): string => {
  if (role === 'STUDENT') return 'Student';
  if (role === 'RECRUITER') return 'Recruiter';
  return 'Institute administrator';
};

/** What actually disappears, per account type. Shown before the password prompt. */
const deletionConsequences = (role: string): string[] => {
  if (role === 'STUDENT') {
    return [
      'Your account, profile, education, experience and skills are deleted immediately.',
      'Your name disappears from your institute’s student list.',
      'Notifications you received are deleted.',
      'Shortlists you were part of stay in your institute’s history, but they show “This student no longer exists on the platform.” instead of your details.',
      'You are signed out everywhere and cannot sign in again.',
    ];
  }
  if (role === 'RECRUITER') {
    return [
      'Your account, company profile and contact details are deleted immediately.',
      'Hiring requests you already sent stay visible to the institutes you sent them to, but they become read-only and show “This recruiter no longer exists on the platform.”',
      'Institutes can no longer approve, shortlist or dispatch those requests.',
      'You are signed out everywhere and cannot sign in again.',
    ];
  }
  return [
    'Your institute account and administrator login are deleted immediately.',
    'Every student account belonging to this institute is deleted as well, along with their profiles and notifications.',
    'Recruiters keep the hiring requests they sent you as read-only history, shown as “This institute no longer exists on the platform.”',
    'Your skill catalogue is deleted along with the institute.',
    'You are signed out everywhere and cannot sign in again.',
  ];
};

export const SettingsPage = () => {
  const { user, isLoading } = useCurrentUser();
  const queryClient = useQueryClient();

  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [website, setWebsite] = useState<string | null>(null);
  const [contactEmail, setContactEmail] = useState<string | null>(null);
  const [contactPhone, setContactPhone] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const navigate = useNavigate();

  const isInstituteAdmin = user?.role === 'INSTITUTE_ADMIN';

  const notifications = useQuery({
    queryKey: ['settings', 'notifications'],
    queryFn: () => api.get<{ emailNotifications: boolean }>('/settings/notifications'),
    enabled: Boolean(user),
  });

  const institute = useQuery({
    queryKey: ['institute', 'settings'],
    queryFn: () => api.get<InstituteSettings>('/institute/settings'),
    enabled: isInstituteAdmin,
  });

  const toggleNotifications = useMutation({
    mutationFn: (enabled: boolean) => api.patch('/settings/notifications', { emailNotifications: enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'notifications'] });
      queryClient.invalidateQueries({ queryKey: meQueryKey });
    },
  });

  const rotate = useMutation({
    mutationFn: () => api.post<{ code: string; updatedAt: string }>('/institute/settings/student-code'),
    onSuccess: (data) => {
      setCode(data.code);
      setCopied(false);
      queryClient.invalidateQueries({ queryKey: ['institute', 'settings'] });
    },
  });

  const saveInstitute = useMutation({
    mutationFn: () =>
      api.put('/institute/settings', {
        website: website ?? institute.data?.website ?? null,
        contactEmail: contactEmail ?? institute.data?.contactEmail ?? null,
        contactPhone: contactPhone ?? institute.data?.contactPhone ?? null,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['institute', 'settings'] }),
  });

  const deleteAccount = useMutation({
    mutationFn: () => api.post('/settings/delete-account', { password: deletePassword, confirm: deleteConfirm }),
    onSuccess: () => {
      // The server already dropped every session; clear the cache so nothing
      // cached for this account survives in the browser.
      queryClient.clear();
      navigate('/login?deleted=1', { replace: true });
    },
    onError: () => setDeletePassword(''),
  });

  if (isLoading || !user) return <LoadingState label="Loading settings" />;

  const enabled = notifications.data?.emailNotifications ?? true;

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Account details and email preferences." />

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium text-foreground">{user.displayName}</span>
          </div>
          {user.username ? (
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Username</span>
              <span className="font-medium text-foreground">{user.username}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium text-foreground">{user.email}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Account type</span>
            <Badge variant="outline">{roleLabel(user.role)}</Badge>
          </div>
          {user.institute ? (
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Institute</span>
              <span className="text-right font-medium text-foreground">
                {user.institute.name}
                <span className="block text-xs font-normal text-muted-foreground">{user.institute.aisheCode}</span>
              </span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Optional emails</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Hiring-request updates, shortlist notifications and other product emails.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="Send optional emails"
              onClick={() => toggleNotifications.mutate(!enabled)}
              disabled={toggleNotifications.isPending}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                enabled ? 'bg-primary' : 'bg-input'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-card shadow transition-transform ${
                  enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="rounded-md border border-border bg-muted/50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            <p className="font-medium text-foreground">These are always sent</p>
            <p className="mt-1">
              Verification codes, registration links, password resets and account-security messages. Turning optional
              emails off never blocks you from creating an account or recovering it.
            </p>
          </div>

          {toggleNotifications.isError ? <Alert tone="error">{errorMessage(toggleNotifications.error)}</Alert> : null}
        </CardContent>
      </Card>

      {isInstituteAdmin ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Student verification code</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Students need this 32-character code to register for your institute. Only a hash is stored, so it is
                shown once when it is generated. If you lose it, generate a new one.
              </p>

              {code ? (
                <div className="rounded-md border border-border bg-muted/60 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">New code — copy it now</p>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="flex-1 break-all font-mono text-sm text-foreground">{code}</code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(code);
                          setCopied(true);
                        } catch {
                          setCopied(false);
                        }
                      }}
                    >
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                </div>
              ) : (
                <Alert tone="warning" title="The current code cannot be displayed">
                  It was included in your welcome email. Rotating it is the only way to see it again.
                </Alert>
              )}

              {rotate.isError ? <Alert tone="error">{errorMessage(rotate.error)}</Alert> : null}

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (
                      window.confirm(
                        'Generate a new student code? Students who already registered keep their accounts; only future registrations need the new code.',
                      )
                    ) {
                      rotate.mutate();
                    }
                  }}
                  disabled={rotate.isPending}
                >
                  <KeyRound className="h-4 w-4" />
                  Generate new code
                </Button>
                <span className="text-xs text-muted-foreground">
                  {institute.data?.studentCodeUpdatedAt
                    ? `Last changed ${new Date(institute.data.studentCodeUpdatedAt).toLocaleString()}`
                    : 'Never changed'}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Institute details</CardTitle>
            </CardHeader>
            <CardContent>
              {institute.isLoading ? (
                <LoadingState label="Loading institute" />
              ) : institute.isError ? (
                <Alert tone="error">{errorMessage(institute.error)}</Alert>
              ) : (
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveInstitute.mutate();
                  }}
                >
                  <div className="rounded-md border border-border bg-muted/50 px-3 py-2.5">
                    <p className="text-sm font-medium text-foreground">{institute.data?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      AISHE {institute.data?.aisheCode} · {institute.data?.district}, {institute.data?.state}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      The name and location come from the AISHE directory and cannot be edited here.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Contact email" htmlFor="contactEmail">
                      <Input
                        id="contactEmail"
                        type="email"
                        defaultValue={institute.data?.contactEmail ?? ''}
                        onChange={(event) => setContactEmail(event.target.value)}
                      />
                    </Field>
                    <Field label="Contact phone" htmlFor="contactPhone">
                      <Input
                        id="contactPhone"
                        defaultValue={institute.data?.contactPhone ?? ''}
                        onChange={(event) => setContactPhone(event.target.value)}
                      />
                    </Field>
                  </div>

                  <Field label="Website" htmlFor="website">
                    <Input
                      id="website"
                      defaultValue={institute.data?.website ?? ''}
                      placeholder="https://"
                      onChange={(event) => setWebsite(event.target.value)}
                    />
                  </Field>

                  {saveInstitute.isError ? <Alert tone="error">{errorMessage(saveInstitute.error)}</Alert> : null}
                  {saveInstitute.isSuccess ? <Alert tone="success">Institute details saved.</Alert> : null}

                  <Button type="submit" disabled={saveInstitute.isPending}>
                    Save institute details
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-xs leading-relaxed text-muted-foreground">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Your institute student code is a shared secret. Anyone with the code and your institute in the list can
              create a student account. Rotate it if it leaks; existing students are unaffected.
            </p>
          </div>
        </>
      ) : null}

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>Delete account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Deleting your {roleLabel(user.role).toLowerCase()} account is permanent and happens immediately. Here is
            exactly what that means for you:
          </p>
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
            {deletionConsequences(user.role).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>

          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs leading-relaxed text-destructive">
            There is no waiting period and no recovery. A confirmation email is sent before anything is removed.
          </div>

          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4" />
            Delete my account
          </Button>
        </CardContent>
      </Card>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) {
            setDeletePassword('');
            setDeleteConfirm('');
            deleteAccount.reset();
          }
        }}
      >
        <DialogContent
          title="Delete your account permanently?"
          description="This cannot be undone. Confirm with your password to continue."
        >
          <div className="space-y-4">
            <Alert tone="warning" title="This is permanent">
              {user.role === 'INSTITUTE_ADMIN'
                ? 'Your institute account and every student account belonging to it will be deleted immediately.'
                : 'Your account and profile will be deleted immediately.'}
            </Alert>

            {deleteAccount.isError ? <Alert tone="error">{errorMessage(deleteAccount.error)}</Alert> : null}

            <Field label="Your password" htmlFor="deletePassword" required>
              <Input
                id="deletePassword"
                type="password"
                autoComplete="current-password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
              />
            </Field>

            <Field
              label="Type DELETE to confirm"
              htmlFor="deleteConfirm"
              hint="Capitals, exactly as shown"
              error={deleteConfirm.length > 0 && deleteConfirm !== 'DELETE' ? 'Type DELETE in capitals' : undefined}
              required
            >
              <Input
                id="deleteConfirm"
                value={deleteConfirm}
                onChange={(event) => setDeleteConfirm(event.target.value)}
                autoComplete="off"
              />
            </Field>

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleteAccount.isPending}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={deleteAccount.isPending || deletePassword.length === 0 || deleteConfirm !== 'DELETE'}
                onClick={() => deleteAccount.mutate()}
              >
                {deleteAccount.isPending ? <Spinner /> : <Trash2 className="h-3.5 w-3.5" />}
                Delete permanently
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export type { AuthUser };
