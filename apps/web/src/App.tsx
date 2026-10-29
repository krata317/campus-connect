import { useEffect } from 'react';
import { Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { GuestOnly, RequireRole } from '@/components/guards';
import { meQueryKey } from '@/hooks/useAuth';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { InstituteLayout, RecruiterLayout, StudentLayout } from '@/layouts';
import { LandingPage } from '@/pages/LandingPage';
import { LoginPage } from '@/pages/LoginPage';
import { StudentRegisterPage } from '@/pages/StudentRegisterPage';
import { InstituteRegisterPage } from '@/pages/InstituteRegisterPage';
import { InstituteCompletePage } from '@/pages/InstituteCompletePage';
import { RecruiterRegisterPage } from '@/pages/RecruiterRegisterPage';
import { RecruiterCompletePage } from '@/pages/RecruiterCompletePage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { UnauthorizedPage } from '@/pages/UnauthorizedPage';
import { StudentDashboardPage } from '@/pages/student/StudentDashboardPage';
import { StudentProfilePage } from '@/pages/student/StudentProfilePage';
import { StudentNotificationsPage } from '@/pages/student/StudentNotificationsPage';
import { InstituteDashboardPage } from '@/pages/institute/InstituteDashboardPage';
import { InstituteStudentsPage } from '@/pages/institute/InstituteStudentsPage';
import { InstituteStudentDetailPage } from '@/pages/institute/InstituteStudentDetailPage';
import { InstituteSkillsPage } from '@/pages/institute/InstituteSkillsPage';
import { InstituteRequestsPage } from '@/pages/institute/InstituteRequestsPage';
import { InstituteRequestDetailPage } from '@/pages/institute/InstituteRequestDetailPage';
import { InstituteRoleCandidatesPage } from '@/pages/institute/InstituteRoleCandidatesPage';
import { InstituteDispatchesPage } from '@/pages/institute/InstituteDispatchesPage';
import { RecruiterDashboardPage } from '@/pages/recruiter/RecruiterDashboardPage';
import { RecruiterCompanyPage } from '@/pages/recruiter/RecruiterCompanyPage';
import { RecruiterRequestsPage } from '@/pages/recruiter/RecruiterRequestsPage';
import { RecruiterRequestEditorPage } from '@/pages/recruiter/RecruiterRequestEditorPage';
import { RecruiterRequestDetailPage } from '@/pages/recruiter/RecruiterRequestDetailPage';

/**
 * Listens for a 401 from any protected request and returns the visitor to the
 * sign-in page with an explanation. The server is still the authority — this
 * only spares the user from looking at panels that can no longer load.
 */
const SessionWatcher = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    const handle = () => {
      queryClient.setQueryData(meQueryKey, null);
      queryClient.clear();
      navigate('/login?expired=1', { replace: true });
    };
    window.addEventListener('cc:session-ended', handle);
    return () => window.removeEventListener('cc:session-ended', handle);
  }, [navigate, queryClient]);

  return null;
};

export const App = () => (
  <>
    <SessionWatcher />
    <Routes>
    <Route
      element={
        <PublicLayout>
          <Outlet />
        </PublicLayout>
      }
    >
      <Route path="/" element={<LandingPage />} />
      <Route
        path="/login"
        element={
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        }
      />
      <Route
        path="/register/student"
        element={
          <GuestOnly>
            <StudentRegisterPage />
          </GuestOnly>
        }
      />
      <Route
        path="/register/institute"
        element={
          <GuestOnly>
            <InstituteRegisterPage />
          </GuestOnly>
        }
      />
      <Route
        path="/register/institute/complete"
        element={
          <GuestOnly>
            <InstituteCompletePage />
          </GuestOnly>
        }
      />
      <Route
        path="/register/recruiter"
        element={
          <GuestOnly>
            <RecruiterRegisterPage />
          </GuestOnly>
        }
      />
      <Route
        path="/register/recruiter/complete"
        element={
          <GuestOnly>
            <RecruiterCompletePage />
          </GuestOnly>
        }
      />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Route>

    <Route
      path="/student"
      element={
        <RequireRole role="STUDENT">
          <StudentLayout />
        </RequireRole>
      }
    >
      <Route index element={<StudentDashboardPage />} />
      <Route path="profile" element={<StudentProfilePage />} />
      <Route path="notifications" element={<StudentNotificationsPage />} />
      <Route path="settings" element={<SettingsPage />} />
    </Route>

    <Route
      path="/institute"
      element={
        <RequireRole role="INSTITUTE_ADMIN">
          <InstituteLayout />
        </RequireRole>
      }
    >
      <Route index element={<InstituteDashboardPage />} />
      <Route path="students" element={<InstituteStudentsPage />} />
      <Route path="students/:id" element={<InstituteStudentDetailPage />} />
      <Route path="skills" element={<InstituteSkillsPage />} />
      <Route path="requests" element={<InstituteRequestsPage />} />
      <Route path="requests/:id" element={<InstituteRequestDetailPage />} />
      <Route path="roles/:roleId" element={<InstituteRoleCandidatesPage />} />
      <Route path="dispatches" element={<InstituteDispatchesPage />} />
      <Route path="settings" element={<SettingsPage />} />
    </Route>

    <Route
      path="/recruiter"
      element={
        <RequireRole role="RECRUITER">
          <RecruiterLayout />
        </RequireRole>
      }
    >
      <Route index element={<RecruiterDashboardPage />} />
      <Route path="company" element={<RecruiterCompanyPage />} />
      <Route path="requests" element={<RecruiterRequestsPage />} />
      <Route path="requests/new" element={<RecruiterRequestEditorPage />} />
      <Route path="requests/:id" element={<RecruiterRequestDetailPage />} />
      <Route path="requests/:id/edit" element={<RecruiterRequestEditorPage />} />
      <Route path="settings" element={<SettingsPage />} />
    </Route>
    </Routes>
  </>
);
