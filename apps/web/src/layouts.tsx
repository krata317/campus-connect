import { Outlet } from 'react-router-dom';
import { Bell, Briefcase, Building2, ClipboardList, LayoutDashboard, ListChecks, Send, UserRound, Users, Wrench } from 'lucide-react';
import { AppShell, type NavItem } from '@/components/layout/AppShell';

const studentNav: NavItem[] = [
  { to: '/student', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/student/profile', label: 'My profile', icon: UserRound },
  { to: '/student/notifications', label: 'Notifications', icon: Bell },
];

const adminNav: NavItem[] = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/students', label: 'Students', icon: Users },
  { to: '/admin/skills', label: 'Skill catalogue', icon: Wrench },
  { to: '/admin/employers', label: 'Employer approvals', icon: Building2 },
  { to: '/admin/requests', label: 'Hiring requests', icon: ClipboardList },
  { to: '/admin/dispatches', label: 'Dispatch history', icon: Send },
];

const employerNav: NavItem[] = [
  { to: '/employer', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/employer/company', label: 'Company profile', icon: Briefcase },
  { to: '/employer/requests', label: 'Hiring requests', icon: ListChecks },
];

export const StudentLayout = () => (
  <AppShell roleLabel="Student portal" navItems={studentNav}>
    <Outlet />
  </AppShell>
);

export const AdminLayout = () => (
  <AppShell roleLabel="Placement cell" navItems={adminNav}>
    <Outlet />
  </AppShell>
);

export const EmployerLayout = () => (
  <AppShell roleLabel="Employer portal" navItems={employerNav}>
    <Outlet />
  </AppShell>
);
