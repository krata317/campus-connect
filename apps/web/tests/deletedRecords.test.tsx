import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DELETED_ACCOUNT_NOTICE } from '@campusconnect/shared';

/**
 * Historical records must say the account is gone, in the same words everywhere.
 * The API sends `null` names plus a `*Deleted` flag; these tests pin both halves
 * of that contract on the screens that render it.
 */

const get = vi.fn();

vi.mock('@/lib/api', () => ({
  api: { get: (path: string) => get(path) },
  ApiError: class ApiError extends Error {
    status = 400;
    code = 'BAD_REQUEST';
    fieldErrors: { path: string; message: string }[] = [];
  },
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong'),
}));

const { DeletedNotice } = await import('@/components/shared/DeletedNotice');
const { InstituteRequestsPage } = await import('@/pages/institute/InstituteRequestsPage');

const renderWithClient = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('deleted account notices', () => {
  beforeEach(() => {
    get.mockReset();
  });

  it('uses the agreed wording for each account type', () => {
    const { rerender } = render(<DeletedNotice kind="STUDENT" />);
    expect(screen.getByText('This student no longer exists on the platform.')).toBeInTheDocument();

    rerender(<DeletedNotice kind="RECRUITER" />);
    expect(screen.getByText('This recruiter no longer exists on the platform.')).toBeInTheDocument();

    rerender(<DeletedNotice kind="INSTITUTE" />);
    expect(screen.getByText('This institute no longer exists on the platform.')).toBeInTheDocument();
  });

  it('shows the recruiter notice in the institute request list', async () => {
    get.mockResolvedValue({
      items: [
        {
          id: 'req_1',
          title: 'Graduate hiring drive',
          assessmentInstructions: null,
          status: 'APPROVED',
          recruiterId: 'rec_1',
          recruiterName: null,
          recruiterDeleted: true,
          instituteId: 'ins_1',
          instituteName: 'Northfield',
          instituteDeleted: false,
          submittedAt: '2026-10-01T00:00:00.000Z',
          reviewedAt: null,
          reviewNote: null,
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
          roles: [],
        },
      ],
    });

    renderWithClient(<InstituteRequestsPage />);

    expect(await screen.findByText(DELETED_ACCOUNT_NOTICE.RECRUITER)).toBeInTheDocument();
    // The request itself is still listed, so the history is not lost.
    expect(screen.getByText('Graduate hiring drive')).toBeInTheDocument();
  });
});
