import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  ChangeEmailInput,
  ChangePasswordInput,
  LocalizedText,
  MeView,
  SessionView,
} from '@tk/contracts';
import { api, queryClient } from './client';
import { track } from '@/lib/analytics';
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

/** Email change (D-074): a code goes to the new address; the account switches when it is confirmed. */
export function useRequestEmailChange() {
  return useMutation({
    mutationFn: (input: ChangeEmailInput) => api.post('/me/email/change', input),
  });
}

export function useConfirmEmailChange() {
  return useMutation({
    mutationFn: (code: string) => api.post('/me/email/confirm', { code }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.me }),
  });
}

/** A picked picture as the app holds it: a file address on phones, a Blob on the web build. */
export interface PickedPhoto {
  uri: string;
  name: string;
  mimeType: string;
  file?: Blob | null;
}

/** Profile photo (D-074): the server crops it to a square and keeps only the newest one. */
export function useSetAvatar() {
  return useMutation({
    mutationFn: (photo: PickedPhoto) => {
      const form = new FormData();
      if (photo.file) form.append('file', photo.file, photo.name);
      else form.append('file', { uri: photo.uri, name: photo.name, type: photo.mimeType } as unknown as Blob);
      return api.put<{ avatarUrl: string }>('/me/avatar', form);
    },
    onSuccess: ({ avatarUrl }) =>
      queryClient.setQueryData<MeView>(keys.me, (me) => (me ? { ...me, avatarUrl } : me)),
  });
}

export function useRemoveAvatar() {
  return useMutation({
    mutationFn: () => api.delete('/me/avatar'),
    onSuccess: () =>
      queryClient.setQueryData<MeView>(keys.me, (me) => (me ? { ...me, avatarUrl: null } : me)),
  });
}

/** Account deletion after the grace period set in the CMS (D-032); can be cancelled until then. */
export function useRequestDeletion() {
  return useMutation({
    mutationFn: () => api.post<{ scheduledFor: string }>('/me/deletion'),
    onSuccess: () => {
      track('account_deletion_requested');
      return queryClient.invalidateQueries({ queryKey: keys.me });
    },
  });
}

export function useCancelDeletion() {
  return useMutation({
    mutationFn: () => api.delete('/me/deletion'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.me }),
  });
}
