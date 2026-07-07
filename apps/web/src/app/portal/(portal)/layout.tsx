'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, ChevronDown, LogOut, User } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { portalApi } from '@/lib/portal-api';
import { usePortalAuth } from '@/lib/portal-auth';
import { PortalLogo } from '@/lib/portal-ui';

const NAV = [
  { label: 'Dashboard', href: '/portal' },
  { label: 'My Records', href: '/portal/records' },
  { label: 'Reports', href: '/portal/reports' },
  { label: 'Requisitions', href: '/portal/requisitions' },
  { label: 'Messages', href: '/portal/messages' },
];

export default function PortalAppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthed, hydrated, claims, clear } = usePortalAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { if (hydrated && !isAuthed) router.replace('/portal/login'); }, [hydrated, isAuthed, router]);

  const { data: me } = useQuery({
    queryKey: ['portal-me'],
    queryFn: () => portalApi.get('/portal/auth/me').then((r) => r.data),
    enabled: isAuthed,
  });

  // Unread badge on Messages: threads the lab is actively handling / has replied to.
  const { data: crData } = useQuery({
    queryKey: ['portal-cr-unread'],
    queryFn: () => portalApi.get('/portal/change-requests', { params: { pageSize: 50 } }).then((r) => r.data),
    enabled: isAuthed,
    refetchInterval: 30_000,
  });
  const unread = (crData?.data ?? []).filter((t: any) => t.status === 'InReview').length;

  if (!hydrated || !isAuthed) return null;

  const firstName = me?.firstName ?? claims?.firstName ?? '';
  const lastName = me?.lastName ?? claims?.lastName ?? '';
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase() || (me?.email ?? claims?.email ?? '?')[0]?.toUpperCase();

  const isActive = (href: string) => (href === '/portal' ? pathname === '/portal' : pathname.startsWith(href));

  const signOut = () => { clear(); router.replace('/portal/login'); };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <header className="sticky top-0 z-30 flex h-[60px] items-center justify-between border-b border-[#EEF2F7] bg-white px-4 sm:px-8">
        <Link href="/portal"><PortalLogo compact /></Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => {
            const on = isActive(n.href);
            return (
              <Link key={n.href} href={n.href}
                className={`relative px-4 py-[19px] text-[14px] font-semibold transition-colors ${on ? 'text-[#4F46E5]' : 'text-[#64748B] hover:text-[#0F172A]'}`}>
                {n.label}
                {n.href === '/portal/messages' && unread > 0 && (
                  <span className="ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#E63946] px-1 text-[10px] font-bold text-white align-middle">{unread}</span>
                )}
                {on && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-[#4F46E5]" />}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <button aria-label="Notifications" className="grid h-9 w-9 place-items-center rounded-full border border-[#EEF2F7] text-[#64748B] transition-colors hover:text-[#0F172A]"><Bell size={17} /></button>
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-[#F3F4F6]">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[#4F46E5] text-[12px] font-bold text-white">{initials}</span>
              <ChevronDown size={15} className="text-[#94A3B8]" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-[#EEF2F7] bg-white p-1.5 shadow-lg">
                  <div className="px-3 py-2">
                    <div className="truncate text-[13px] font-semibold text-[#0F172A]">{firstName} {lastName}</div>
                    <div className="truncate text-[12px] text-[#94A3B8]">{me?.email ?? claims?.email}</div>
                  </div>
                  <div className="my-1 border-t border-[#F1F5F9]" />
                  <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-[#374151] hover:bg-[#F5F4F0]"><User size={15} /> My Account</button>
                  <button onClick={signOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-[#DC2626] hover:bg-[#FEF2F2]"><LogOut size={15} /> Sign Out</button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Mobile nav */}
      <nav className="flex items-center gap-1 overflow-x-auto border-b border-[#EEF2F7] bg-white px-4 md:hidden">
        {NAV.map((n) => {
          const on = isActive(n.href);
          return (
            <Link key={n.href} href={n.href} className={`whitespace-nowrap px-3 py-3 text-[13px] font-semibold ${on ? 'text-[#4F46E5]' : 'text-[#64748B]'}`}>
              {n.label}
              {n.href === '/portal/messages' && unread > 0 && (
                <span className="ml-1 inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[#E63946] px-1 text-[9px] font-bold text-white align-middle">{unread}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <main className="mx-auto max-w-[1100px] px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}
