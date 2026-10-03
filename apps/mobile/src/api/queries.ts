import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  AuthTokens,
  ForgotPasswordInput,
  GoogleLoginInput,
  LocalizedText,
  LoginInput,
  MeView,
  RegisterInput,
  ResetPasswordInput,
  SendVerificationOtpInput,
  UpdateMeInput,
  VerifyOtpInput,
} from '@tk/contracts';
import type { AppConfig } from '@/lib/app-gate';
import { track } from '@/lib/analytics';
import { deviceInfo } from '@/lib/device';
import { useSession } from '@/state/session';
import { api, queryClient } from './client';

export interface ExamNodeView {
  id: string;
  parentId: string | null;
  nodeType: string;
  name: LocalizedText;
  description: LocalizedText | null;
  iconUrl: string | null;
  childCount: number;
}

export interface NodeTypeView {
  key: string;
  name: LocalizedText;
  rank: number;
}

export interface TargetPostView {
  id: string;
  nodeType: string;
  name: LocalizedText;
  path: Array<{ id: string; nodeType: string; name: LocalizedText }>;
}

export interface CourseCardView {
  id: string;
  slug: string;
  title: LocalizedText;
  shortDescription: LocalizedText | null;
  thumbnailUrl: string | null;
  isFree: boolean;
}

export const keys = {
  config: ['config'] as const,
  me: ['me'] as const,
  targetPosts: ['me', 'target-posts'] as const,
  myCourses: ['me', 'courses'] as const,
  nodeTypes: ['exam-node-types'] as const,
  examNodes: (parentId: string | null) => ['exam-nodes', parentId] as const,
};

// ───────────── Reads ─────────────

export function useAppConfig() {
  return useQuery({
    queryKey: keys.config,
    queryFn: () => api.get<AppConfig>('/app/config', { auth: false }),
    staleTime: 5 * 60_000,
    refetchInterval: 15 * 60_000,
  });
}

export function useMe(enabled = true) {
  return useQuery({ queryKey: keys.me, queryFn: () => api.get<MeView>('/me'), enabled });
}

export function useTargetPosts(enabled = true) {
  return useQuery({
    queryKey: keys.targetPosts,
    queryFn: () => api.get<TargetPostView[]>('/me/target-posts'),
    enabled,
  });
}

export function useNodeTypes() {
  return useQuery({
    queryKey: keys.nodeTypes,
    queryFn: () => api.get<NodeTypeView[]>('/exam-node-types', { auth: false }),
    staleTime: 30 * 60_000,
  });
}

export function useExamNodes(parentId: string | null) {
  return useQuery({
    queryKey: keys.examNodes(parentId),
    queryFn: () =>
      api.get<ExamNodeView[]>(parentId ? `/exam-nodes?parentId=${parentId}` : '/exam-nodes', { auth: false }),
  });
}

// ───────────── Auth ─────────────

async function signedIn(tokens: AuthTokens) {
  queryClient.clear();
  await useSession.getState().setTokens(tokens);
}

export function useLogin() {
  return useMutation({
    mutationFn: async (input: Omit<LoginInput, 'device'>) =>
      api.post<AuthTokens>('/auth/login', { ...input, device: await deviceInfo() }, { auth: false }),
    onSuccess: async (tokens) => {
      track('logged_in', { method: 'password' });
      await signedIn(tokens);
    },
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: async (input: Omit<RegisterInput, 'device'>) =>
      api.post<AuthTokens>('/auth/register', { ...input, device: await deviceInfo() }, { auth: false }),
    onSuccess: async (tokens) => {
      track('signed_up', { method: 'email' });
      useSession.getState().setVerifyPrompt(true);
      await signedIn(tokens);
    },
  });
}

export function useGoogleLogin() {
  return useMutation({
    mutationFn: async (input: Omit<GoogleLoginInput, 'device'>) =>
      api.post<AuthTokens>('/auth/google', { ...input, device: await deviceInfo() }, { auth: false }),
    onSuccess: async (tokens) => {
      track('logged_in', { method: 'google' });
      await signedIn(tokens);
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (input: ForgotPasswordInput) => api.post('/auth/password/forgot', input, { auth: false }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (input: ResetPasswordInput) => api.post('/auth/password/reset', input, { auth: false }),
  });
}

export async function logout() {
  try {
    await api.post('/auth/logout');
  } catch {
    // Signing out locally must work offline too; the server session expires on its own.
  }
  queryClient.clear();
  await useSession.getState().setTokens(null);
}

// ───────────── Account ─────────────

export function useSendVerification() {
  return useMutation({
    mutationFn: (input: SendVerificationOtpInput) => api.post('/me/verification/send', input),
  });
}

export function useVerify() {
  return useMutation({
    mutationFn: (input: VerifyOtpInput) => api.post('/me/verification/verify', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.me }),
  });
}

export function useUpdateMe() {
  return useMutation({
    mutationFn: (input: UpdateMeInput) => api.patch<MeView>('/me', input),
    onSuccess: (me) => queryClient.setQueryData(keys.me, me),
  });
}

export function useSetTargetPosts() {
  return useMutation({
    mutationFn: (examNodeIds: string[]) => api.put<TargetPostView[]>('/me/target-posts', { examNodeIds }),
    onSuccess: (posts) => queryClient.setQueryData(keys.targetPosts, posts),
  });
}
