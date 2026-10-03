import { useMutation, useQuery } from '@tanstack/react-query';
import type { ChangePasswordInput, LocalizedText, SessionView } from '@tk/contracts';
import { api, queryClient } from './client';
import { keys } from './queries';

export const accountKeys = {
  educationLevels: ['education-levels'] as const,
  sessions: ['me', 'sessions'] as const,
};

/** Education levels the CMS offers for the profile picker. */
export function useEducationLevels() {
  return useQuery({
    queryKey: accountKeys.educationLevels,
    queryFn: () => api.get<Array<{ id: string; name: LocalizedText }>>('/education-levels', { auth: false }),
    staleTime: 30 * 60_000,
  });
}

export function useSessions() {
  return useQuery({ queryKey: accountKeys.sessions, queryFn: () => api.get<SessionView[]>('/me/sessions') });
}

export function useRevokeSession() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/me/sessions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.sessions }),
  });
}

/** Changing the password signs out the student's other devices (the API keeps this one). */
export function useChangePassword() {
  return useMutation({
    mutationFn: (input: ChangePasswordInput) => api.post('/me/password', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.sessions }),
  });
}

/** Account deletion after the grace period set in the CMS (D-032); can be cancelled until then. */
export function useRequestDeletion() {
  return useMutation({
    mutationFn: () => api.post<{ scheduledFor: string }>('/me/deletion'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.me }),
  });
}

export function useCancelDeletion() {
  return useMutation({
    mutationFn: () => api.delete('/me/deletion'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.me }),
  });
}
