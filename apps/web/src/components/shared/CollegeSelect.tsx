import { forwardRef } from 'react';
import type { SelectHTMLAttributes } from 'react';
import { Alert, Spinner } from '@/components/ui/feedback';
import { Select } from '@/components/ui/form';
import { useColleges } from '@/hooks/useColleges';

/**
 * College selector used by both public registration forms. The value posted is
 * the college slug; the server resolves it to a college record and derives the
 * tenant id from the database, so a tampered value cannot select another
 * tenant's data.
 */
export const CollegeSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>((props, ref) => {
  const colleges = useColleges();

  if (colleges.isLoading) {
    return (
      <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-white px-3 text-sm text-muted-foreground">
        <Spinner />
        Loading colleges
      </div>
    );
  }

  if (colleges.isError) {
    return <Alert tone="error">Could not load the list of colleges. Refresh the page and try again.</Alert>;
  }

  const items = colleges.data ?? [];

  if (items.length === 0) {
    return (
      <Alert tone="warning" title="No college is accepting registrations yet">
        A placement administrator has to create the college first. Ask your placement cell to complete the setup, then
        register again.
      </Alert>
    );
  }

  return (
    // `defaultValue=""` keeps the placeholder selected: without it the browser
    // silently picks the first college, which would be the wrong tenant for
    // anyone who submits without reading the field.
    <Select ref={ref} required defaultValue="" {...props}>
      <option value="" disabled>
        Select your college
      </option>
      {items.map((college) => (
        <option key={college.id} value={college.slug}>
          {college.name}
        </option>
      ))}
    </Select>
  );
});

CollegeSelect.displayName = 'CollegeSelect';
