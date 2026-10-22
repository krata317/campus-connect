import { useQuery } from '@tanstack/react-query';
import type { AuthUser, Role } from '@campusconnect/shared';
import { api, ApiError } from '@/lib/api';

export const meQueryKey = ['auth', 'me'] as const;

export const dashboardPathFor = (role: Role): string => {
  if (role === 'ADMIN') return '/admin';
  if (role === 'EMPLOYER') return '/employer';
  return '/student';
};

export function useCurrentUser() {
  const query = useQuery<AuthUser | null>({
    queryKey: meQueryKey,
    queryFn: async () => {
      try {
        const result = await api.get<{ user: AuthUser }>('/auth/me');
        return result.user;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 20_000,
    retry: false,
  });

  return {
    user: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}
