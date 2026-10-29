import { Outlet } from 'react-router-dom';
import { Bell, Building2, ClipboardList, LayoutDashboard, ListChecks, Send, UserRound, Users, Wrench } from 'lucide-react';
import { AppShell, type NavItem } from '@/components/layout/AppShell';

const studentNav: NavItem[] = [
  { to: '/student', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/student/profile', label: 'My profile', icon: UserRound },
  { to: '/student/notifications', label: 'Notifications', icon: Bell },
];

const instituteNav: NavItem[] = [
  { to: '/institute', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/institute/students', label: 'Students', icon: Users },
  { to: '/institute/skills', label: 'Skills', icon: Wrench },
  { to: '/institute/requests', label: 'Hiring requests', icon: ClipboardList },
  { to: '/institute/dispatches', label: 'Dispatches', icon: Send },
];

const recruiterNav: NavItem[] = [
  { to: '/recruiter', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/recruiter/company', label: 'Company profile', icon: Building2 },
  { to: '/recruiter/requests', label: 'Hiring requests', icon: ListChecks },
];

export const StudentLayout = () => (
  <AppShell roleLabel="Student" navItems={studentNav}>
    <Outlet />
  </AppShell>
);

export const InstituteLayout = () => (
  <AppShell roleLabel="Institute administrator" navItems={instituteNav}>
    <Outlet />
  </AppShell>
);

export const RecruiterLayout = () => (
  <AppShell roleLabel="Recruiter" navItems={recruiterNav}>
    <Outlet />
  </AppShell>
);
