import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, Building2, CheckCircle2, GraduationCap, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { dashboardPathFor, useCurrentUser } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const roles = [
  {
    icon: GraduationCap,
    title: 'Students',
    description: 'One profile for your academics, skills and experience. Get notified when your placement cell shortlists you.',
    to: '/register/student',
    cta: 'Create student account',
  },
  {
    icon: Building2,
    title: 'Recruiters',
    description: 'One account, every institute. Send structured hiring requests and follow each one through review.',
    to: '/register/recruiter',
    cta: 'Register as a recruiter',
  },
  {
    icon: ShieldCheck,
    title: 'Institutes',
    description: 'Verify with your AISHE code, review requests, evaluate real student records and dispatch shortlists.',
    to: '/register/institute',
    cta: 'Register your institute',
  },
];

const steps = [
  { step: '01', title: 'Verify', body: 'Institutes confirm their AISHE code, recruiters confirm their company email. Both are checked with a one-time code.' },
  { step: '02', title: 'Request', body: 'A recruiter picks an institute and sends roles with explicit eligibility criteria.' },
  { step: '03', title: 'Review', body: 'The institute approves, rejects, or asks for changes — every decision is recorded.' },
  { step: '04', title: 'Shortlist', body: 'Eligibility is computed from real student records, then the institute dispatches the final list.' },
];

export const LandingPage = () => {
  const { user, isLoading } = useCurrentUser();

  if (!isLoading && user) {
    return <Navigate to={dashboardPathFor(user.role)} replace />;
  }

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="surface-grid absolute inset-0 opacity-40" aria-hidden />
        <div className="relative mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <div className="max-w-2xl">
            <Badge variant="info">Campus placements, end to end</Badge>
            <h1 className="mt-5 text-3xl font-semibold leading-[1.15] text-foreground sm:text-4xl lg:text-5xl">
              The placement process, without the spreadsheets.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Campus Connect connects students, recruiters and institute placement cells in one place. Requests are
              structured, eligibility is checked against real records, and every shortlist is a deliberate decision.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/register/institute" className={cn(buttonVariants({ size: 'lg' }))}>
                Register your institute
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/login" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>
                Sign in
              </Link>
            </div>
            <p className="mt-5 text-sm text-muted-foreground">
              Already registered? Your placement cell can share the student verification code you need.
            </p>
          </div>
        </div>
      </section>

      {/* Roles */}
      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
        <div className="grid gap-5 md:grid-cols-3">
          {roles.map((role) => (
            <div
              key={role.title}
              className="flex flex-col rounded-xl border border-border bg-card p-6 shadow-card transition-colors hover:border-primary/40"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <role.icon className="h-5 w-5" />
              </span>
              <h2 className="mt-4 text-base font-semibold text-foreground">{role.title}</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{role.description}</p>
              <Link
                to={role.to}
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                {role.cta}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-border bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">How a placement round works</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Four steps, the same for every institute. Nothing is sent to students until the placement cell confirms it.
            </p>
          </div>
          <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((item) => (
              <li key={item.step} className="relative rounded-xl border border-border bg-card p-5">
                <span className="text-xs font-semibold tracking-widest text-primary">{item.step}</span>
                <h3 className="mt-2 text-sm font-semibold text-foreground">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Honest note about verification */}
      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
        <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CheckCircle2 className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-foreground">What verification actually proves</h2>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                An AISHE code confirms that the institute exists in the official directory. An email code confirms access
                to that mailbox. Neither one proves that the person registering has authority to act for the institute,
                and Campus Connect does not claim otherwise. Recruiter email verification works the same way: it confirms
                the mailbox, not legal ownership of the company.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
