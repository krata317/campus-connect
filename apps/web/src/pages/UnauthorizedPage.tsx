import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const UnauthorizedPage = () => (
  <div className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-foreground">
      <ShieldAlert className="h-6 w-6" />
    </span>
    <div className="space-y-1">
      <h1 className="text-xl font-semibold">This area is not available to your account</h1>
      <p className="text-sm text-muted-foreground">
        Campus Connect has separate portals for students, recruiters and institute administrators. Sign in with the right account
        type to continue.
      </p>
    </div>
    <div className="flex gap-2">
      <Link to="/login" className={cn(buttonVariants())}>
        Sign in again
      </Link>
      <Link to="/" className={cn(buttonVariants({ variant: 'outline' }))}>
        Back to home
      </Link>
    </div>
  </div>
);
