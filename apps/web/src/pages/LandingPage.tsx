import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, Building2, GraduationCap, ShieldCheck, UserRound, Users } from 'lucide-react';
import { dashboardPathFor, useCurrentUser } from '@/hooks/useAuth';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const portals = [
  {
    icon: GraduationCap,
    title: 'Students',
    description: 'Keep your academic record, skills and experience in one profile, and receive shortlist notifications from your college placement cell.',
    to: '/register/student',
    cta: 'Create student account',
  },
  {
    icon: Building2,
    title: 'Recruiters',
    description: 'Register against a college, submit hiring requests with structured eligibility criteria, and track their review status.',
    to: '/register/employer',
    cta: 'Register as a recruiter',
  },
  {
    icon: ShieldCheck,
    title: 'College administrators',
    description: 'Review hiring requests, evaluate real student data against criteria, finalise shortlists and notify selected students.',
    to: '/login',
    cta: 'Administrator sign in',
  },
];

const steps = [
  { title: 'Recruiter submits a request', body: 'One request can carry several roles, each with its own structured eligibility criteria.' },
  { title: 'College administrator reviews it', body: 'Requests are approved, rejected, or returned with a note explaining what needs to change.' },
  { title: 'Eligibility is computed', body: 'Saved academic records, backlogs, experience and skills are evaluated against the role criteria.' },
  { title: 'Shortlist is dispatched', body: 'The placement cell confirms the final list. Each selected student receives an in-app notification.' },
];

export const LandingPage = () => {
  const { user, isLoading } = useCurrentUser();

  if (!isLoading && user) {
    return <Navigate to={dashboardPathFor(user.role)} replace />;
  }

  return (
    <div>
      <section className="border-b border-border bg-white">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
          <div className="max-w-xl space-y-6">
            <Badge variant="info">Multi-college placement management</Badge>
            <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
              Campus placement operations, kept in one place.
            </h1>
            <p className="text-base leading-relaxed text-muted-foreground">
              CampusConnect connects students, recruiters and college placement cells. Recruiters submit structured hiring
              requests, the college verifies who is actually eligible, and selected students are notified inside the portal.
              Each college is fully separate — its own students, recruiters, skills and requests.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link to="/register/student" className={cn(buttonVariants({ size: 'lg' }))}>
                Create student account
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/login" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>
                Sign in
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">
              The portal starts with an empty database. Nothing here is sample data — every record comes from real use.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-navy-50/60 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-navy-500">How it works</p>
            <ol className="mt-4 space-y-4">
              {steps.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy-900 text-xs font-semibold text-white">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-navy-900">{step.title}</p>
                    <p className="text-sm text-muted-foreground">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Three portals, one workflow</h2>
            <p className="mt-1 text-sm text-muted-foreground">Each account type only sees what it needs.</p>
          </div>
          <Users className="hidden h-5 w-5 text-navy-300 sm:block" />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {portals.map((portal) => (
            <Card key={portal.title}>
              <CardContent className="space-y-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-navy-50 text-navy-700">
                  <portal.icon className="h-4.5 w-4.5" />
                </span>
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-navy-900">{portal.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{portal.description}</p>
                </div>
                <Link to={portal.to} className="inline-flex items-center gap-1 text-sm font-medium text-navy-700 hover:underline">
                  {portal.cta}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-2 rounded-lg border border-border bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <UserRound className="mt-0.5 h-4 w-4 text-navy-500" />
            <div>
              <p className="text-sm font-medium text-navy-900">No college set up yet?</p>
              <p className="text-sm text-muted-foreground">
                Colleges are created by an operator, not through a public form:{' '}
                <code className="rounded bg-navy-50 px-1.5 py-0.5 text-xs">npm run admin:bootstrap</code> creates one college
                and its first administrator. Run it again for each additional college.
              </p>
            </div>
          </div>
          <Link to="/login" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0')}>
            Go to sign in
          </Link>
        </div>
      </section>
    </div>
  );
};
