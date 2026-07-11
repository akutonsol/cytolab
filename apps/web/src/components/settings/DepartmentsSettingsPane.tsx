'use client';

import { useRouter } from 'next/navigation';
import { ArrowRight, Building2 } from 'lucide-react';
import { Button } from '@/components/ui';

/**
 * Settings > General > Departments. Department management already lives on its
 * own full-featured page (KPIs, cards, create/edit/delete) — this pane orients
 * the user and links there rather than duplicating the CRUD.
 */
export function DepartmentsSettingsPane() {
  const router = useRouter();
  return (
    <div className="max-w-[640px]">
      <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">Departments</h3>
      <p className="mt-1 font-body-sm text-body-sm text-secondary">
        Organize your staff into departments and assign managers. Department management has its own workspace.
      </p>

      <div className="mt-6 flex items-center gap-4 rounded-2xl border border-outline-variant p-5">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><Building2 size={22} /></span>
        <div className="min-w-0 flex-1">
          <div className="font-label-md text-label-md text-charcoal-heading">Manage departments</div>
          <div className="font-body-sm text-body-sm text-secondary">Create, edit and assign managers to departments, and view staff counts.</div>
        </div>
        <Button onClick={() => router.push('/departments')} className="flex items-center gap-2">
          Open <ArrowRight size={15} />
        </Button>
      </div>
    </div>
  );
}
