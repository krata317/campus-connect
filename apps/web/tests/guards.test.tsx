import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AuthUser } from '@campusconnect/shared';

const authState: { user: AuthUser | null; isLoading: boolean } = { user: null, isLoading: false };

vi.mock('@/hooks/useAuth', () => ({
  useCurrentUser: () => authState,
  dashboardPathFor: (role: string) => `/${role.toLowerCase()}`,
  meQueryKey: ['auth', 'me'],
}));

const { RequireRole, GuestOnly } = await import('@/components/guards');

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<p>Login screen</p>} />
        <Route path="/unauthorized" element={<p>Not allowed</p>} />
        <Route path="/student" element={<p>Student dashboard</p>} />
        <Route path="/admin" element={<p>Admin dashboard</p>} />
        <Route
          path="/guard/student"
          element={
            <RequireRole role="STUDENT">
              <p>Protected student area</p>
            </RequireRole>
          }
        />
        <Route
          path="/guest"
          element={
            <GuestOnly>
              <p>Sign in form</p>
            </GuestOnly>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

const studentUser: AuthUser = { id: 'stu_1', role: 'STUDENT', email: 'asha@example.edu', displayName: 'Asha Verma' };

describe('RequireRole', () => {
  beforeEach(() => {
    authState.user = null;
    authState.isLoading = false;
  });

  it('sends an anonymous visitor to the login screen', () => {
    renderAt('/guard/student');

    expect(screen.getByText('Login screen')).toBeInTheDocument();
    expect(screen.queryByText('Protected student area')).not.toBeInTheDocument();
  });

  it('shows a loading state instead of flashing a redirect while the session is checked', () => {
    authState.isLoading = true;
    renderAt('/guard/student');

    expect(screen.getByText(/loading campus connect/i)).toBeInTheDocument();
  });

  it('sends a signed-in user of the wrong role to the unauthorized page', () => {
    authState.user = { ...studentUser, role: 'EMPLOYER' };
    renderAt('/guard/student');

    expect(screen.getByText('Not allowed')).toBeInTheDocument();
  });

  it('renders the protected content for the right role', () => {
    authState.user = studentUser;
    renderAt('/guard/student');

    expect(screen.getByText('Protected student area')).toBeInTheDocument();
  });
});

describe('GuestOnly', () => {
  beforeEach(() => {
    authState.user = null;
    authState.isLoading = false;
  });

  it('shows the form to an anonymous visitor', () => {
    renderAt('/guest');

    expect(screen.getByText('Sign in form')).toBeInTheDocument();
  });

  it('redirects an already signed-in user to their own dashboard', () => {
    authState.user = studentUser;
    renderAt('/guest');

    expect(screen.getByText('Student dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Sign in form')).not.toBeInTheDocument();
  });

  it('sends an administrator to the admin dashboard', () => {
    authState.user = { id: 'adm_1', role: 'ADMIN', email: 'admin@example.edu', displayName: 'Admin' };
    renderAt('/guest');

    expect(screen.getByText('Admin dashboard')).toBeInTheDocument();
  });
});
