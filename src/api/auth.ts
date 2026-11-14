import { apiRequest } from './client';

export interface AuthSessionResponse {
  user: { id: string; roles: string[] };
  csrfToken: string;
  expiresAt: string;
  impersonation?: ImpersonationSession | null;
}

export interface ImpersonationSession {
  active: true;
  actorUserId: string;
  targetUserId: string;
  reason: string;
  expiresAt: string;
}

export const authApi = {
  login: (email: string, password: string) => apiRequest<AuthSessionResponse>('/api/v1/auth/login', {
    method: 'POST', body: { email, password }, authenticated: false,
  }),
  partnerStart: (redirectUri: string) => apiRequest<{ authorizationUrl: string }>('/api/v1/auth/partner/start', {
    method: 'POST', body: { redirectUri }, authenticated: false,
  }),
  partnerLogin: (code: string, state: string) => apiRequest<AuthSessionResponse>('/api/v1/auth/partner', {
    method: 'POST', body: { code, state }, authenticated: false,
  }),
  session: () => apiRequest<AuthSessionResponse>('/api/v1/auth/session', { authenticated: false }),
  startImpersonation: (targetUserId: string, reason: string, currentPassword: string) =>
    apiRequest<AuthSessionResponse>('/api/v1/admin/impersonations', {
      method: 'POST', body: { targetUserId, reason, currentPassword },
    }),
  stopImpersonation: () => apiRequest<AuthSessionResponse>('/api/v1/admin/impersonations/stop', { method: 'POST' }),
  logout: () => apiRequest<{ status: string }>('/api/v1/auth/logout', { method: 'POST' }),
  changePassword: (currentPassword: string, newPassword: string) => apiRequest<{ status: string }>('/api/v1/auth/password', {
    method: 'POST', body: { currentPassword, newPassword },
  }),
  requestEmailVerification: (email: string) => apiRequest<{ status: 'accepted' }>('/api/v1/auth/email-verification/request', {
    method: 'POST', body: { email }, authenticated: false,
  }),
  confirmEmailVerification: (token: string) => apiRequest<{ status: 'ok' }>('/api/v1/auth/email-verification/confirm', {
    method: 'POST', body: { token }, authenticated: false,
  }),
  requestPasswordRecovery: (email: string) => apiRequest<{ status: 'accepted' }>('/api/v1/auth/password-recovery/request', {
    method: 'POST', body: { email }, authenticated: false,
  }),
  resetRecoveredPassword: (token: string, newPassword: string) => apiRequest<{ status: 'ok' }>('/api/v1/auth/password-recovery/reset', {
    method: 'POST', body: { token, newPassword }, authenticated: false,
  }),
};
