'use client';

import { Inbox } from 'lucide-react';
import { navItemByPath } from '@/lib/nav';

export function ComingSoon({ path }: { path: string }) {
  const item = navItemByPath(path);
  return (
    <div className="glass-card rounded-2xl p-10">
      <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary-fixed text-primary"><Inbox size={26} /></span>
        <div className="font-headline-sm text-headline-sm text-charcoal-heading">{item?.label ?? 'Module'}</div>
        <div className="font-body-sm text-body-sm text-secondary">
          {item?.phase ? `This module is coming in Phase ${item.phase}.` : 'This module is not available yet.'}
        </div>
      </div>
    </div>
  );
}
