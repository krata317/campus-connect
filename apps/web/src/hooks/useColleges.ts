import { useQuery } from '@tanstack/react-query';
import type { CollegeSummary } from '@campusconnect/shared';
import { api } from '@/lib/api';

export const collegesQueryKey = ['colleges', 'public'] as const;

/** Active colleges only — the public registration list. */
export function useColleges() {
  return useQuery<CollegeSummary[]>({
    queryKey: collegesQueryKey,
    queryFn: () => api.get<{ items: CollegeSummary[] }>('/colleges').then((response) => response.items),
    staleTime: 60_000,
    retry: 1,
  });
}
