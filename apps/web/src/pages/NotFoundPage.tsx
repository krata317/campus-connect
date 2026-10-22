import { Link } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const NotFoundPage = () => (
  <div className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-navy-100 text-navy-700">
      <FileQuestion className="h-6 w-6" />
    </span>
    <div className="space-y-1">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">The page you asked for does not exist in this application.</p>
    </div>
    <Link to="/" className={cn(buttonVariants())}>
      Back to home
    </Link>
  </div>
);
