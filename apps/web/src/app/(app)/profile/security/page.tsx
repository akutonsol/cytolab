'use client';

import { useState } from 'react';
import Image from 'next/image';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { message, Popconfirm } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge, BoolPill, Card, SecurityPage, Table, dangerBtn, ghostBtn, primaryBtn } from '@/components/security/ui';
import { fmtDateTime, relTime, type LoginAttempt, type UserSession } from '@/lib/security';

const inputCls = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-400';

interface MfaStatus { totpEnabled: boolean; emailEnabled: boolean; backupCodesRemaining: number }

export default function ProfileSecurityPage() {
  const qc = useQueryClient();

  const { data: sessions = [] } = useQuery({ queryKey: ['my-sessions'], queryFn: () => api.get<UserSession[]>('/auth/profile/sessions').then((r) => r.data) });
  const { data: history = [] } = useQuery({ queryKey: ['my-login-history'], queryFn: () => api.get<LoginAttempt[]>('/auth/profile/login-history').then((r) => r.data) });
  const { data: mfa } = useQuery({ queryKey: ['my-mfa'], queryFn: () => api.get<MfaStatus>('/auth/mfa/status').then((r) => r.data) });

  // ── MFA setup wizard ───────────────────────────────────────────────────────
  const [setup, setSetup] = useState<{ qrCode: string; manualEntryKey: string } | null>(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  const startSetup = useMutation({
    mutationFn: () => api.post('/auth/mfa/totp/setup').then((r) => r.data),
    onSuccess: (d) => { setSetup(d); setBackupCodes(null); },
    onError: () => message.error('Could not start MFA setup'),
  });
  const verifySetup = useMutation({
    mutationFn: () => api.post('/auth/mfa/totp/verify', { code: code.trim() }).then((r) => r.data),
    onSuccess: (d: { backupCodes: string[] }) => {
      setBackupCodes(d.backupCodes); setSetup(null); setCode('');
      message.success('Two-factor authentication enabled');
      qc.invalidateQueries({ queryKey: ['my-mfa'] });
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Invalid code'),
  });
  const disableTotp = useMutation({
    mutationFn: (c: string) => api.post('/auth/mfa/totp/disable', { code: c }).then((r) => r.data),
    onSuccess: () => { message.success('TOTP disabled'); qc.invalidateQueries({ queryKey: ['my-mfa'] }); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Invalid code'),
  });
  const [disableCode, setDisableCode] = useState('');

  // ── Sessions ────────────────────────────────────────────────────────────────
  const terminateOthers = useMutation({
    mutationFn: () => api.post('/auth/profile/sessions/terminate-others').then((r) => r.data),
    onSuccess: () => { message.success('Other sessions signed out'); qc.invalidateQueries({ queryKey: ['my-sessions'] }); },
    onError: () => message.error('Could not terminate sessions'),
  });

  // ── Password change ──────────────────────────────────────────────────────────
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const changePw = useMutation({
    mutationFn: () => api.post('/auth/change-password', { currentPassword: pw.current, newPassword: pw.next }).then((r) => r.data),
    onSuccess: () => { message.success('Password changed'); setPw({ current: '', next: '', confirm: '' }); },
    onError: (e: any) => {
      const m = e?.response?.data?.message;
      message.error(Array.isArray(m) ? m.join(' ') : m ?? 'Could not change password');
    },
  });
  const pwMismatch = pw.next.length > 0 && pw.next !== pw.confirm;

  return (
    <SecurityPage title="Security" subtitle="Your sessions, two-factor authentication, and password" icon={<ShieldCheck size={20} />}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* MFA */}
        <Card title="Two-factor authentication">
          <div className="p-5">
            <div className="mb-3 flex items-center gap-2 text-sm">
              <span className="text-slate-600">Authenticator app (TOTP)</span>
              <BoolPill on={!!mfa?.totpEnabled} onText="Enabled" offText="Off" />
              {mfa && mfa.backupCodesRemaining > 0 && <span className="text-xs text-slate-500">· {mfa.backupCodesRemaining} backup codes left</span>}
            </div>

            {backupCodes ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="mb-2 text-sm font-semibold text-emerald-700">Save your backup codes</p>
                <p className="mb-3 text-xs text-emerald-600">Each can be used once if you lose your authenticator. They won't be shown again.</p>
                <div className="grid grid-cols-2 gap-2 font-mono text-sm text-slate-800">
                  {backupCodes.map((c) => <div key={c} className="rounded bg-white px-2 py-1 text-center">{c}</div>)}
                </div>
                <button className={`${ghostBtn} mt-3`} onClick={() => setBackupCodes(null)}>Done</button>
              </div>
            ) : setup ? (
              <div className="flex flex-col items-start gap-3">
                <p className="text-sm text-slate-600">Scan this with your authenticator app, then enter the 6-digit code.</p>
                <Image src={setup.qrCode} alt="TOTP QR code" width={168} height={168} className="rounded-lg border border-slate-200" unoptimized />
                <p className="text-xs text-slate-500">Manual key: <span className="font-mono text-slate-600">{setup.manualEntryKey}</span></p>
                <input className={inputCls} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} />
                <div className="flex gap-2">
                  <button className={primaryBtn} disabled={!code.trim() || verifySetup.isPending} onClick={() => verifySetup.mutate()}>Verify & enable</button>
                  <button className={ghostBtn} onClick={() => { setSetup(null); setCode(''); }}>Cancel</button>
                </div>
              </div>
            ) : mfa?.totpEnabled ? (
              <div className="flex flex-col items-start gap-2">
                <p className="text-sm text-slate-500">TOTP is protecting your account.</p>
                <div className="flex items-end gap-2">
                  <input className={`${inputCls} w-40`} placeholder="Current code" value={disableCode} onChange={(e) => setDisableCode(e.target.value)} />
                  <Popconfirm title="Disable two-factor authentication?" onConfirm={() => disableTotp.mutate(disableCode.trim())} okText="Disable" okButtonProps={{ danger: true }}>
                    <button className={dangerBtn} disabled={!disableCode.trim()}>Disable</button>
                  </Popconfirm>
                </div>
              </div>
            ) : (
              <button className={primaryBtn} onClick={() => startSetup.mutate()} disabled={startSetup.isPending}>
                <KeyRound size={15} /> Set up authenticator
              </button>
            )}
          </div>
        </Card>

        {/* Password */}
        <Card title="Change password">
          <div className="flex flex-col gap-3 p-5">
            <input type="password" autoComplete="current-password" className={inputCls} placeholder="Current password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            <input type="password" autoComplete="new-password" className={inputCls} placeholder="New password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            <input type="password" autoComplete="new-password" className={`${inputCls} ${pwMismatch ? 'border-red-300' : ''}`} placeholder="Confirm new password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            {pwMismatch && <span className="text-xs text-red-500">Passwords don't match.</span>}
            <p className="text-xs text-slate-500">At least 12 characters with upper, lower, number, and special character.</p>
            <button
              className={`${primaryBtn} justify-center`}
              disabled={!pw.current || !pw.next || pwMismatch || changePw.isPending}
              onClick={() => changePw.mutate()}
            >
              {changePw.isPending ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </Card>
      </div>

      {/* Sessions */}
      <div className="mt-4">
        <Card title="Active sessions" actions={
          <Popconfirm title="Sign out all your other sessions?" onConfirm={() => terminateOthers.mutate()} okText="Sign out others">
            <button className={ghostBtn}>Terminate other sessions</button>
          </Popconfirm>
        }>
          <Table<UserSession>
            rows={sessions}
            rowKey={(s) => s.id}
            empty="No active sessions."
            columns={[
              { key: 'device', header: 'Device', render: (s) => s.deviceName ?? ([s.browser, s.os].filter(Boolean).join(' · ') || '—') },
              { key: 'ip', header: 'IP', render: (s) => <span className="font-mono text-xs">{s.ipAddress}</span> },
              { key: 'loc', header: 'Location', render: (s) => [s.city, s.country].filter(Boolean).join(', ') || '—' },
              { key: 'active', header: 'Last active', render: (s) => relTime(s.lastActiveAt) },
              { key: 'login', header: 'Signed in', render: (s) => <span className="text-slate-500">{fmtDateTime(s.createdAt)}</span> },
            ]}
          />
        </Card>
      </div>

      {/* Login history */}
      <div className="mt-4">
        <Card title="Recent login activity">
          <Table<LoginAttempt>
            rows={history}
            rowKey={(l) => l.id}
            empty="No recent activity."
            columns={[
              { key: 'time', header: 'Time', render: (l) => <span className="text-slate-500">{fmtDateTime(l.createdAt)}</span> },
              { key: 'ip', header: 'IP', render: (l) => <span className="font-mono text-xs">{l.ipAddress}</span> },
              { key: 'loc', header: 'Location', render: (l) => [l.city, l.country].filter(Boolean).join(', ') || '—' },
              { key: 'ua', header: 'Browser / OS', render: (l) => [l.browser, l.os].filter(Boolean).join(' · ') || '—' },
              {
                key: 'ok', header: 'Result', render: (l) =>
                  l.success ? <Badge size="sm" tone="success-strong">Success</Badge> : <Badge size="sm" tone="danger-strong">{l.failReason ?? 'Failed'}</Badge>,
              },
            ]}
          />
        </Card>
      </div>
    </SecurityPage>
  );
}
