'use client';

import type { ReactNode } from 'react';
import {
  AppstoreOutlined,
  BarChartOutlined,
  BellOutlined,
  CalendarOutlined,
  InfoCircleOutlined,
  MailOutlined,
  MessageOutlined,
  SearchOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { cn } from './cn';
import { Avatar } from './Avatar';
import { ChevronDown } from './icons';

export interface RailItem {
  key: string;
  icon: ReactNode;
  label?: string;
}
export interface TopItem {
  key: string;
  label: string;
}
interface UserChip {
  name: string;
  role: string;
  src?: string;
}
interface AppShellProps {
  variant?: 'rail' | 'top';
  logo?: ReactNode;
  brand?: string;
  railItems?: RailItem[];
  railFooterItems?: RailItem[];
  topItems?: TopItem[];
  activeKey?: string;
  onNavigate?: (key: string) => void;
  user?: UserChip;
  searchPlaceholder?: string;
  footerNote?: string;
  children: ReactNode;
}

const DEFAULT_RAIL: RailItem[] = [
  { key: 'dashboard', icon: <AppstoreOutlined /> },
  { key: 'people', icon: <TeamOutlined /> },
  { key: 'chat', icon: <MessageOutlined /> },
  { key: 'calendar', icon: <CalendarOutlined /> },
  { key: 'analytics', icon: <BarChartOutlined /> },
];
const DEFAULT_RAIL_FOOTER: RailItem[] = [
  { key: 'settings', icon: <SettingOutlined /> },
  { key: 'info', icon: <InfoCircleOutlined /> },
];
const DEFAULT_TOP: TopItem[] = [
  { key: 'home', label: 'Home' },
  { key: 'orders', label: 'Orders' },
  { key: 'resources', label: 'Resources' },
  { key: 'customers', label: 'Customers' },
  { key: 'analytics', label: 'Analytics' },
];

function DefaultLogo() {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-control bg-primary text-primary-on">
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <path d="M10 2l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V5l7-3z" fill="currentColor" opacity="0.25" />
        <path d="M10 6.5v7M6.5 10h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function SearchBar({ placeholder }: { placeholder: string }) {
  return (
    <div className="flex h-10 max-w-md flex-1 items-center gap-2 rounded-control border border-border bg-surface px-3 text-text-tertiary">
      <SearchOutlined />
      <input
        placeholder={placeholder}
        className="w-full border-0 bg-transparent text-sm text-text outline-none placeholder:text-text-tertiary"
      />
    </div>
  );
}

function UserChipView({ user }: { user: UserChip }) {
  return (
    <div className="flex items-center gap-2.5 rounded-pill py-1 pl-1 pr-2">
      <Avatar name={user.name} src={user.src} size={34} />
      <div className="hidden flex-col leading-tight sm:flex">
        <span className="text-[13px] font-semibold text-text">{user.name}</span>
        <span className="text-[11px] text-text-tertiary">{user.role}</span>
      </div>
      <ChevronDown className="text-text-tertiary" />
    </div>
  );
}

/**
 * App frame. `rail` = clinical left icon-rail + top search/user bar (the primary
 * Cytolab shell). `top` = Modo-style horizontal top nav. Active item = blue.
 */
export function AppShell({
  variant = 'rail',
  logo,
  brand,
  railItems = DEFAULT_RAIL,
  railFooterItems = DEFAULT_RAIL_FOOTER,
  topItems = DEFAULT_TOP,
  activeKey,
  onNavigate,
  user,
  searchPlaceholder = 'Search something..',
  footerNote,
  children,
}: AppShellProps) {
  if (variant === 'top') {
    return (
      <div className="flex h-full min-h-screen flex-col bg-bg">
        <header className="flex items-center gap-6 border-b border-border bg-surface px-6 py-3">
          <div className="flex items-center gap-2">
            {logo ?? <DefaultLogo />}
            {brand && <span className="text-base font-bold text-text">{brand}</span>}
          </div>
          <nav className="flex items-center gap-1">
            {topItems.map((it) => {
              const active = it.key === activeKey;
              return (
                <button
                  key={it.key}
                  onClick={() => onNavigate?.(it.key)}
                  className={cn(
                    'relative rounded-control px-3 py-1.5 text-sm font-semibold transition-colors',
                    active ? 'text-primary' : 'text-text-secondary hover:text-text',
                  )}
                >
                  {it.label}
                  {active && <span className="absolute -bottom-[13px] left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />}
                </button>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <SearchBar placeholder="Quick search" />
            <button className="grid h-10 w-10 place-items-center rounded-control border border-border bg-surface text-text-secondary hover:text-text">
              <MailOutlined />
            </button>
            <button className="grid h-10 w-10 place-items-center rounded-control border border-border bg-surface text-text-secondary hover:text-text">
              <BellOutlined />
            </button>
            {user && <Avatar name={user.name} src={user.src} size={38} />}
          </div>
        </header>
        <main className="premium-scroll flex-1 overflow-auto p-6">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-screen bg-bg">
      <aside className="flex w-[72px] shrink-0 flex-col items-center border-r border-border bg-surface py-4">
        <div className="mb-6">{logo ?? <DefaultLogo />}</div>
        <nav className="flex flex-col items-center gap-1.5">
          {railItems.map((it) => {
            const active = it.key === activeKey;
            return (
              <button
                key={it.key}
                title={it.label ?? it.key}
                onClick={() => onNavigate?.(it.key)}
                className={cn(
                  'grid h-11 w-11 place-items-center rounded-control text-[18px] transition-colors',
                  active ? 'bg-primary-soft text-primary' : 'text-text-tertiary hover:bg-bg hover:text-text',
                )}
              >
                {it.icon}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col items-center gap-1.5">
          {railFooterItems.map((it) => {
            const active = it.key === activeKey;
            return (
              <button
                key={it.key}
                title={it.label ?? it.key}
                onClick={() => onNavigate?.(it.key)}
                className={cn(
                  'grid h-11 w-11 place-items-center rounded-control text-[18px] transition-colors',
                  active ? 'bg-primary-soft text-primary' : 'text-text-tertiary hover:bg-bg hover:text-text',
                )}
              >
                {it.icon}
              </button>
            );
          })}
          {footerNote && <span className="mt-1 text-[10px] text-text-tertiary">{footerNote}</span>}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 border-b border-border bg-surface px-6 py-3">
          <SearchBar placeholder={searchPlaceholder} />
          <div className="ml-auto flex items-center gap-3">
            <button className="grid h-10 w-10 place-items-center rounded-full text-text-secondary hover:bg-bg hover:text-text">
              <BellOutlined />
            </button>
            {user && <UserChipView user={user} />}
          </div>
        </header>
        <main className="premium-scroll flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
