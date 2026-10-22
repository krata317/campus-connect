import { Outlet, Route, Routes } from 'react-router-dom';
import { GuestOnly, RequireRole } from '@/components/guards';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { AdminLayout, EmployerLayout, StudentLayout } from '@/layouts';
import { LandingPage } from '@/pages/LandingPage';
import { LoginPage } from '@/pages/LoginPage';
import { StudentRegisterPage } from '@/pages/StudentRegisterPage';
import { EmployerRegisterPage } from '@/pages/EmployerRegisterPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { UnauthorizedPage } from '@/pages/UnauthorizedPage';
import { StudentDashboardPage } from '@/pages/student/StudentDashboardPage';
import { StudentProfilePage } from '@/pages/student/StudentProfilePage';
import { StudentNotificationsPage } from '@/pages/student/StudentNotificationsPage';
import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage';
import { AdminStudentsPage } from '@/pages/admin/AdminStudentsPage';
import { AdminStudentDetailPage } from '@/pages/admin/AdminStudentDetailPage';
import { AdminSkillsPage } from '@/pages/admin/AdminSkillsPage';
import { AdminEmployersPage } from '@/pages/admin/AdminEmployersPage';
import { AdminRequestsPage } from '@/pages/admin/AdminRequestsPage';
import { AdminRequestDetailPage } from '@/pages/admin/AdminRequestDetailPage';
import { AdminRoleCandidatesPage } from '@/pages/admin/AdminRoleCandidatesPage';
import { AdminDispatchesPage } from '@/pages/admin/AdminDispatchesPage';
import { EmployerDashboardPage } from '@/pages/employer/EmployerDashboardPage';
import { EmployerCompanyPage } from '@/pages/employer/EmployerCompanyPage';
import { EmployerRequestsPage } from '@/pages/employer/EmployerRequestsPage';
import { EmployerRequestEditorPage } from '@/pages/employer/EmployerRequestEditorPage';
import { EmployerRequestDetailPage } from '@/pages/employer/EmployerRequestDetailPage';

export const App = () => (
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
        path="/register/employer"
        element={
          <GuestOnly>
            <EmployerRegisterPage />
          </GuestOnly>
        }
      />
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
    </Route>

    <Route
      path="/admin"
      element={
        <RequireRole role="ADMIN">
          <AdminLayout />
        </RequireRole>
      }
    >
      <Route index element={<AdminDashboardPage />} />
      <Route path="students" element={<AdminStudentsPage />} />
      <Route path="students/:id" element={<AdminStudentDetailPage />} />
      <Route path="skills" element={<AdminSkillsPage />} />
      <Route path="employers" element={<AdminEmployersPage />} />
      <Route path="requests" element={<AdminRequestsPage />} />
      <Route path="requests/:id" element={<AdminRequestDetailPage />} />
      <Route path="roles/:roleId" element={<AdminRoleCandidatesPage />} />
      <Route path="dispatches" element={<AdminDispatchesPage />} />
    </Route>

    <Route
      path="/employer"
      element={
        <RequireRole role="EMPLOYER">
          <EmployerLayout />
        </RequireRole>
      }
    >
      <Route index element={<EmployerDashboardPage />} />
      <Route path="company" element={<EmployerCompanyPage />} />
      <Route path="requests" element={<EmployerRequestsPage />} />
      <Route path="requests/new" element={<EmployerRequestEditorPage />} />
      <Route path="requests/:id" element={<EmployerRequestDetailPage />} />
      <Route path="requests/:id/edit" element={<EmployerRequestEditorPage />} />
    </Route>
  </Routes>
);
