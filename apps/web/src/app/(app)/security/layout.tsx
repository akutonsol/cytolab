'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { App as AntdApp } from 'antd';
import { useAuth } from '@/lib/auth';
import { notify } from '@/lib/notify';

/**
 * Route guard for the Security Center (TKT-2026-0003). The nav hides these links
 * for non-privileged users, but direct URL navigation must also be blocked
 * client-side. APIs already return 403, so this is defense-in-depth. Access is
 * superuser-only: `can('system:security')` already bypasses for super roles, and
 * we also honour the explicit `isSuperRole` flag.
 */
export default function SecurityLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { message } = AntdApp.useApp();
  const { claims, hydrated, can } = useAuth();
  const allowed = !!claims?.isSuperRole || can('system:security');

  useEffect(() => {
    if (hydrated && claims && !allowed) {
      notify.error('Access denied');
      router.replace('/dashboard');
    }
  }, [hydrated, claims, allowed, message, router]);

  // Render nothing until claims hydrate, or while an unauthorized user is being
  // redirected. The (app) layout handles the unauthenticated → /login case.
  if (!hydrated || !claims || !allowed) return null;
  return <>{children}</>;
}
