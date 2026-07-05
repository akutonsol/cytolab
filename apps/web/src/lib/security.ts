import { api } from './api';

// ─── Types ───────────────────────────────────────────────────────────────────

export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AlertType =
  | 'IMPOSSIBLE_TRAVEL'
  | 'BRUTE_FORCE'
  | 'CREDENTIAL_STUFFING'
  | 'SUSPICIOUS_IP'
  | 'AFTER_HOURS'
  | 'MASS_EXPORT';

export interface SecurityUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface DashboardData {
  kpis: {
    activeSessions: number;
    failedLogins24h: number;
    lockedAccounts: number;
    openAlerts: number;
    blockedIps: number;
    afterHours: number;
  };
  loginsByCountry: { country: string; count: number }[];
  recentAlerts: SecurityAlert[];
  recentLogins: LoginAttempt[];
}

export interface SecurityAlert {
  id: string;
  labId: string | null;
  userId: string | null;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  detail: string;
  ipAddress: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
}

export interface UserSession {
  id: string;
  userId: string;
  deviceName: string | null;
  browser: string | null;
  os: string | null;
  ipAddress: string;
  country: string | null;
  city: string | null;
  lastActiveAt: string;
  createdAt: string;
  user?: SecurityUser;
}

export interface LoginAttempt {
  id: string;
  email: string | null;
  ipAddress: string;
  browser: string | null;
  os: string | null;
  device: string | null;
  country: string | null;
  city: string | null;
  success: boolean;
  failReason: string | null;
  createdAt: string;
}

export interface LockedUser {
  id: string;
  userId: string;
  reason: string;
  lockedAt: string;
  autoUnlockAt: string | null;
  user?: SecurityUser;
}

export interface BlockedIp {
  id: string;
  ipAddress: string;
  reason: string;
  blockedAt: string;
  expiresAt: string | null;
  permanent: boolean;
}

export interface TrustedDevice {
  id: string;
  userId: string;
  deviceName: string | null;
  browser: string | null;
  os: string | null;
  ipAddress: string | null;
  trustedAt: string;
  lastUsedAt: string;
  user?: SecurityUser;
}

export interface MfaUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mfaRequired: boolean;
  lastLoginAt: string | null;
  totpEnabled: boolean;
  emailEnabled: boolean;
}

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
  expiryDays: number;
  maxFailedAttempts: number;
  historyDepth: number;
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

export const securityApi = {
  dashboard: () => api.get<DashboardData>('/security/dashboard').then((r) => r.data),

  sessions: (userId?: string) =>
    api.get<UserSession[]>('/auth/sessions', { params: userId ? { userId } : {} }).then((r) => r.data),
  terminateSession: (id: string) => api.delete(`/auth/sessions/${id}`).then((r) => r.data),
  terminateAllForUser: (userId: string) =>
    api.post(`/auth/users/${userId}/terminate-sessions`).then((r) => r.data),

  loginAttempts: (params: Record<string, string | undefined>) =>
    api.get<LoginAttempt[]>('/auth/login-attempts', { params }).then((r) => r.data),

  lockedUsers: () => api.get<LockedUser[]>('/auth/locked-users').then((r) => r.data),
  unlockUser: (id: string) => api.post(`/auth/users/${id}/unlock`).then((r) => r.data),
  forceReset: (id: string) => api.post(`/auth/users/${id}/force-reset`).then((r) => r.data),

  blockedIps: () => api.get<BlockedIp[]>('/auth/blocked-ips').then((r) => r.data),
  addBlockedIp: (body: { ipAddress: string; reason: string; expiresAt?: string; permanent?: boolean }) =>
    api.post('/auth/blocked-ips', body).then((r) => r.data),
  unblockIp: (id: string) => api.delete(`/auth/blocked-ips/${id}`).then((r) => r.data),

  trustedDevices: (userId?: string) =>
    api.get<TrustedDevice[]>('/auth/trusted-devices', { params: userId ? { userId } : {} }).then((r) => r.data),
  revokeTrustedDevice: (id: string) => api.delete(`/auth/trusted-devices/${id}`).then((r) => r.data),

  mfaUsers: () => api.get<MfaUser[]>('/security/mfa').then((r) => r.data),
  requireMfa: (id: string, required: boolean) =>
    api.patch(`/auth/users/${id}/require-mfa`, { required }).then((r) => r.data),
  resetMfa: (id: string) => api.post(`/auth/users/${id}/reset-mfa`).then((r) => r.data),

  alerts: (params: Record<string, string | undefined>) =>
    api.get<SecurityAlert[]>('/security/alerts', { params }).then((r) => r.data),
  resolveAlert: (id: string) => api.patch(`/security/alerts/${id}/resolve`).then((r) => r.data),

  passwordPolicy: () => api.get<PasswordPolicy>('/security/password-policy').then((r) => r.data),
  updatePasswordPolicy: (body: Partial<PasswordPolicy>) =>
    api.patch<PasswordPolicy>('/security/password-policy', body).then((r) => r.data),
};

// ─── Presentation helpers ────────────────────────────────────────────────────

export const SEVERITY_STYLE: Record<AlertSeverity, { bg: string; color: string }> = {
  CRITICAL: { bg: '#FEF2F2', color: '#DC2626' },
  HIGH: { bg: '#F1F5F9', color: '#B45309' }, // slate bg + dark-amber text — detector-safe, per house style
  MEDIUM: { bg: '#EEF2FF', color: '#4F46E5' },
  LOW: { bg: '#F1F5F9', color: '#64748B' },
};

export const ALERT_TYPE_LABEL: Record<AlertType, string> = {
  IMPOSSIBLE_TRAVEL: 'Impossible Travel',
  BRUTE_FORCE: 'Brute Force',
  CREDENTIAL_STUFFING: 'Credential Stuffing',
  SUSPICIOUS_IP: 'Suspicious IP',
  AFTER_HOURS: 'After Hours',
  MASS_EXPORT: 'Mass Export',
};

export const fullName = (u?: { firstName: string; lastName: string } | null) =>
  u ? `${u.firstName} ${u.lastName}`.trim() : '—';

export const fmtDateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

export const relTime = (iso: string | null) => {
  if (!iso) return '—';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
};
