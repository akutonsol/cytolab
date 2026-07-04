'use client';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PayslipCard } from '@/components/PayslipCard';
import type { SlipData } from '@/lib/payroll';

export default function PayslipPage() {
  const router = useRouter();
  const adviceId = String(useParams().adviceId);
  const { data: slip, isLoading, isError } = useQuery({
    queryKey: ['payslip', adviceId],
    queryFn: () => api.get<SlipData>(`/payroll/advices/${adviceId}/slip`).then((r) => r.data),
    enabled: !!adviceId,
  });

  return (
    <div className="min-h-full" style={{ background: '#F8FAFC' }}>
      <div className="mx-auto max-w-[980px] px-6 py-8">
        <button onClick={() => router.back()} className="no-print mb-4 flex items-center gap-1.5 text-[13px] font-medium text-[#64748B] hover:text-[#0F172A]">
          <ArrowLeft size={15} /> Back
        </button>
        {isLoading ? (
          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-12 text-center text-[14px] text-[#64748B]">Loading payslip…</div>
        ) : isError || !slip ? (
          <div className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-8 text-center text-[15px] font-semibold text-[#991B1B]">Payslip not found</div>
        ) : (
          <div className="printable">
            <PayslipCard slip={slip} showActions />
          </div>
        )}
      </div>
    </div>
  );
}
