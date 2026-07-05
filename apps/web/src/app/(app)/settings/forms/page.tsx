'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';

interface Config { formType: string; fields: any[]; printGroups: any[] }

const FORMS = [
  { type: 'Gynecology', title: 'Gynecology Details', link: 'Gynecology Form' },
  { type: 'NonGynecology', title: 'NON-GYNAECOLOGY', link: 'Non Gynecology Form' },
] as const;

export default function FormSetupPage() {
  const router = useRouter();
  const gyn = useQuery<Config>({ queryKey: ['form-config', 'Gynecology'], queryFn: () => api.get('/form-config/Gynecology').then((r) => r.data) });
  const nongyn = useQuery<Config>({ queryKey: ['form-config', 'NonGynecology'], queryFn: () => api.get('/form-config/NonGynecology').then((r) => r.data) });
  const count = (t: string) => (t === 'Gynecology' ? gyn.data?.fields.length : nongyn.data?.fields.length) ?? 0;

  return (
    <div className="min-h-full pb-8 pt-4" style={{ background: '#F8FAFC' }}>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-[#0F172A]">Form Setup</h1>
          <p className="mt-1.5 text-[14px] text-[#6B7280]">Create a form with your desired Clinical Features</p>
        </div>
        <button disabled title="Both form types are pre-configured. Custom form types coming soon."
          className="flex h-10 cursor-not-allowed items-center gap-2 rounded-lg bg-[#F3F4F6] px-4 text-[14px] font-semibold text-[#9CA3AF]">
          <Plus size={16} /> Add Form
        </button>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {FORMS.map((f) => (
          <div key={f.type} className="glass-card rounded-2xl p-6" style={{ borderTop: '3px solid #4F46E5' }}>
            <div className="font-headline-sm text-headline-sm text-charcoal-heading">{f.title}</div>
            <div className="mt-4 flex items-end gap-2">
              <span className="text-[40px] font-bold leading-none text-[#0F172A]">{count(f.type)}</span>
              <span className="pb-1 text-[14px] text-[#6B7280]">items</span>
            </div>
            <div className="mt-1 text-[13px] text-[#9CA3AF]">Fields included in the form</div>
            <button onClick={() => router.push(`/settings/forms/${f.type}`)} className="mt-4 text-[14px] font-semibold text-[#4F46E5] hover:underline">
              {f.link}
            </button>
            <div className="mt-6 flex items-center justify-between border-t border-[#F3F4F6] pt-4">
              <button disabled title="Cannot delete built-in form types" className="flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-lg text-[#D1D5DB]"><Trash2 size={17} /></button>
              <button onClick={() => router.push(`/settings/forms/${f.type}`)} className="flex h-9 items-center gap-1.5 rounded-lg border border-[#4F46E5] px-4 text-[13px] font-semibold text-[#4F46E5] transition-colors hover:bg-[#EEF3FF]">
                <Pencil size={15} /> Edit
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
