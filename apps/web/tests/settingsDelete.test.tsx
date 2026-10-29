import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AuthUser } from '@campusconnect/shared';

/**
 * The delete-account section is destructive, so its guards are pinned here:
 * the section explains the consequences, the final button stays disabled until
 * the password is present and DELETE has been typed, and the request carries no
 * account id.
 */

const authState: { user: AuthUser | null; isLoading: boolean } = { user: null, isLoading: false };
const navigate = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useCurrentUser: () => authState,
  meQueryKey: ['auth', 'me'],
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const post = vi.fn(() => Promise.resolve(undefined));
const get = vi.fn((path: string) => {
  if (path === '/settings/notifications') return Promise.resolve({ emailNotifications: true });
  return Promise.resolve({});
});

vi.mock('@/lib/api', () => ({
  api: {
    get: (path: string) => get(path),
    post: (path: string, body?: unknown) => post(path, body),
    put: vi.fn(() => Promise.resolve({})),
    patch: vi.fn(() => Promise.resolve({})),
  },
  ApiError: class ApiError extends Error {
    status = 400;
    code = 'BAD_REQUEST';
    fieldErrors: { path: string; message: string }[] = [];
  },
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong'),
}));

const { SettingsPage } = await import('@/pages/SettingsPage');

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const student: AuthUser = {
  id: 'stu_1',
  role: 'STUDENT',
  email: 'asha@example.test',
  displayName: 'Asha Verma',
  emailNotifications: true,
};

describe('delete account settings', () => {
  beforeEach(() => {
    post.mockClear();
    navigate.mockClear();
    authState.user = student;
    authState.isLoading = false;
  });

  it('explains the consequences and keeps the final button disabled until confirmed', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Delete account')).toBeInTheDocument();
    expect(screen.getByText(/Your name disappears from your institute/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Delete my account/i }));

    const confirmButton = await screen.findByRole('button', { name: /Delete permanently/i });
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByLabelText(/Your password/i), 'StudentPass2026');
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByLabelText(/Type DELETE to confirm/i), 'DELETE');
    expect(confirmButton).toBeEnabled();
  });

  it('posts only the password and the confirmation word, then leaves the page', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Delete my account/i }));
    await user.type(screen.getByLabelText(/Your password/i), 'StudentPass2026');
    await user.type(screen.getByLabelText(/Type DELETE to confirm/i), 'DELETE');
    await user.click(screen.getByRole('button', { name: /Delete permanently/i }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/settings/delete-account', {
      password: 'StudentPass2026',
      confirm: 'DELETE',
    }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/login?deleted=1', { replace: true }));
  });

  it('warns institute administrators that student accounts go too', async () => {
    authState.user = {
      id: 'iad_1',
      role: 'INSTITUTE_ADMIN',
      email: 'admin@example.test',
      displayName: 'Placement Admin',
      emailNotifications: true,
      username: 'admin',
      institute: { id: 'ins_1', name: 'Northfield', aisheCode: 'T-1', state: 'Karnataka', district: 'Bengaluru' },
    };
    get.mockImplementation((path: string) => {
      if (path === '/settings/notifications') return Promise.resolve({ emailNotifications: true });
      return Promise.resolve({
        id: 'ins_1',
        aisheCode: 'T-1',
        name: 'Northfield',
        state: 'Karnataka',
        district: 'Bengaluru',
        website: null,
        contactEmail: null,
        contactPhone: null,
        studentCodeUpdatedAt: null,
      });
    });

    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText(/Every student account belonging to this institute is deleted/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Delete my account/i }));
    expect(await screen.findByText(/every student account belonging to it/i)).toBeInTheDocument();
  });
});
