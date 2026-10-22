import { useQuery } from '@tanstack/react-query';
import type { SkillSummary, StudentProfile } from '@campusconnect/shared';
import { api } from '@/lib/api';

export const profileQueryKey = ['student', 'profile'] as const;
export const dashboardQueryKey = ['student', 'dashboard'] as const;
export const notificationsQueryKey = ['student', 'notifications'] as const;
export const skillCatalogueQueryKey = ['skills', 'active'] as const;

export function useStudentProfile() {
  return useQuery({
    queryKey: profileQueryKey,
    queryFn: () => api.get<{ profile: StudentProfile }>('/students/me/profile').then((response) => response.profile),
  });
}

export function useSkillCatalogue() {
  return useQuery({
    queryKey: skillCatalogueQueryKey,
    queryFn: () => api.get<{ items: SkillSummary[] }>('/skills').then((response) => response.items),
    staleTime: 60_000,
  });
}
