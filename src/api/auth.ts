import { apiRequest } from './client';

export interface AuthSessionResponse {
  user: { id: string; roles: string[] };
  csrfToken: string;
  expiresAt: string;
}

export const authApi = {
  login: (email: string, password: string) => apiRequest<AuthSessionResponse>('/api/v1/auth/login', {
    method: 'POST', body: { email, password }, authenticated: false,
  }),
  session: () => apiRequest<AuthSessionResponse>('/api/v1/auth/session', { authenticated: false }),
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
