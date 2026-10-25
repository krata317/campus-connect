import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CollegeSelect } from '@/components/shared/CollegeSelect';

const renderWithQuery = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

const mockColleges = (items: { id: string; name: string; slug: string }[]) => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ items }),
    }),
  );
};

describe('CollegeSelect', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers the active colleges returned by the API', async () => {
    mockColleges([
      { id: 'col_1', name: 'Northfield Institute of Technology', slug: 'northfield-institute' },
      { id: 'col_2', name: 'Lakeside College of Engineering', slug: 'lakeside-college' },
    ]);

    renderWithQuery(<CollegeSelect id="collegeSlug" />);

    await waitFor(() => expect(screen.getByText('Northfield Institute of Technology')).toBeInTheDocument());
    expect(screen.getByText('Lakeside College of Engineering')).toBeInTheDocument();

    // The value posted is the slug, not an internal id.
    const options = screen.getAllByRole('option') as HTMLOptionElement[];
    expect(options.some((option) => option.value === 'northfield-institute')).toBe(true);
    expect(options.some((option) => option.value === 'col_1')).toBe(false);
  });

  it('starts with no college selected so a choice is always explicit', async () => {
    mockColleges([{ id: 'col_1', name: 'Northfield Institute of Technology', slug: 'northfield-institute' }]);

    renderWithQuery(<CollegeSelect id="collegeSlug" />);

    const select = await screen.findByRole('combobox');
    expect((select as HTMLSelectElement).value).toBe('');
  });

  it('explains what to do when no college exists yet', async () => {
    mockColleges([]);

    renderWithQuery(<CollegeSelect id="collegeSlug" />);

    await waitFor(() => expect(screen.getByText(/No college is accepting registrations yet/i)).toBeInTheDocument());
  });
});
