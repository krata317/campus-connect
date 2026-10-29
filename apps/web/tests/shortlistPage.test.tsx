import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CandidateEvaluation } from '@campusconnect/shared';
import { emptyCriteria } from '@campusconnect/shared';

/**
 * Regression coverage for the blank shortlist page.
 *
 * The page reads the recruiter attached to a hiring request. The API returns
 * that field as `recruiter`; an earlier version of the page read `company`,
 * which threw during render and left the whole app blank. These tests pin the
 * real response shape so the mismatch cannot come back.
 */

const candidate = (overrides: Partial<CandidateEvaluation> = {}): CandidateEvaluation => ({
  studentId: 'stu_1',
  fullName: 'Asha Verma',
  email: 'asha@example.test',
  eligible: true,
  checks: [
    { key: 'cgpa', label: 'CGPA', requirement: '6.0 and above', status: 'PASS', observed: '8.4' },
  ],
  matchedSkills: ['TypeScript'],
  missingSkills: [],
  reasons: [],
  undergrad: {
    degree: 'B.Tech',
    branch: 'CSE',
    institution: 'Example Institute',
    passingYear: 2027,
    scoreType: 'CGPA',
    scoreValue: 8.4,
    scoreScale: 10,
  },
  class10Percentage: 90,
  class12Percentage: 88,
  activeBacklogs: 0,
  experienceMonths: 6,
  skills: [],
  shortlistStatus: null,
  ...overrides,
} as CandidateEvaluation);

const response = (candidates: CandidateEvaluation[]) => ({
  role: {
    id: 'role_1',
    title: 'Backend Engineer',
    description: 'Build services',
    location: 'Bengaluru',
    employmentType: 'FULL_TIME',
    registrationUrl: 'https://example.test/apply',
    criteria: { ...emptyCriteria(), maxActiveBacklogs: 0, graduationYears: [2027] },
    status: 'APPROVED',
    shortlistStatus: 'NONE',
    shortlistedCount: 0,
    dispatchedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  },
  request: {
    id: 'req_1',
    title: 'Graduate hiring 2027',
    status: 'APPROVED',
    assessmentInstructions: 'Two online rounds',
  },
  recruiter: { id: 'rec_1', name: 'Northwind Systems' },
  candidates,
  totalStudents: candidates.length,
  eligibleCount: candidates.filter((item) => item.eligible).length,
  shortlistCount: 0,
});

const get = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    get: (path: string) => get(path),
    put: vi.fn(() => Promise.resolve({ count: 0 })),
    post: vi.fn(() => Promise.resolve({ dispatched: 0 })),
  },
  ApiError: class ApiError extends Error {
    status: number;
    code: string;
    fieldErrors: { path: string; message: string }[] = [];
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong'),
}));

vi.mock('@/hooks/useStudent', () => ({
  useSkillCatalogue: () => ({ data: [], isLoading: false }),
}));

const { InstituteRoleCandidatesPage } = await import('@/pages/institute/InstituteRoleCandidatesPage');

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/institute/roles/role_1']}>
        <Routes>
          <Route path="/institute/roles/:roleId" element={<InstituteRoleCandidatesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('institute shortlist page', () => {
  beforeEach(() => {
    get.mockReset();
  });

  it('renders candidates using the recruiter returned by the API', async () => {
    get.mockImplementation((path: string) => {
      if (path.startsWith('/institute/roles/role_1/candidates')) return Promise.resolve(response([candidate()]));
      if (path.startsWith('/institute/roles/role_1/shortlist')) return Promise.resolve({ items: [] });
      return Promise.reject(new Error(`Unexpected request: ${path}`));
    });

    renderPage();

    expect(await screen.findByText('Backend Engineer')).toBeInTheDocument();
    // The recruiter name comes from the response header line, not from a
    // `company` field the API does not send.
    expect(await screen.findByText(/Northwind Systems/)).toBeInTheDocument();
    expect(await screen.findByText('Asha Verma')).toBeInTheDocument();
    // "Eligible" appears twice on purpose: once as the summary stat and once as
    // the badge on the student row.
    expect(screen.getAllByText('Eligible').length).toBeGreaterThanOrEqual(2);
  });

  it('shows an empty state instead of a blank page when nobody qualifies', async () => {
    get.mockImplementation((path: string) => {
      if (path.startsWith('/institute/roles/role_1/candidates')) return Promise.resolve(response([]));
      if (path.startsWith('/institute/roles/role_1/shortlist')) return Promise.resolve({ items: [] });
      return Promise.reject(new Error(`Unexpected request: ${path}`));
    });

    renderPage();

    expect(await screen.findByText(/No student currently meets these criteria/i)).toBeInTheDocument();
  });

  it('shows a readable error instead of a blank page when the request fails', async () => {
    get.mockImplementation((path: string) => {
      if (path.startsWith('/institute/roles/role_1/candidates')) {
        return Promise.reject(new Error('Job role not found'));
      }
      return Promise.resolve({ items: [] });
    });

    renderPage();

    expect(await screen.findByText('Job role not found')).toBeInTheDocument();
  });
});
