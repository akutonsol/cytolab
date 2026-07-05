'use client';

import { ReactNode } from 'react';
import { Shield } from 'lucide-react';
import { useAuth } from '@/lib/auth';

/** Wraps management-only KB pages (create/edit) behind the kb:manage permission. */
export function KbAccessGate({ children }: { children: ReactNode }) {
  const { can } = useAuth();
  if (can('kb:manage')) return <>{children}</>;
  return (
    <div className="min-h-full pt-4" style={{ background: '#F8FAFC' }}>
      <div className="mx-auto mt-16 max-w-md rounded-2xl border border-[#EEF2F7] bg-white p-8 text-center shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
        <Shield size={28} className="mx-auto text-[#9CA3AF]" />
        <div className="mt-3 text-[18px] font-bold text-[#0F172A]">Access restricted</div>
        <div className="mt-1 text-[14px] text-[#6B7280]">Editing knowledge base articles requires the kb:manage permission.</div>
      </div>
    </div>
  );
}
