'use client';

import { History, X } from 'lucide-react';

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'moments ago';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

interface Props {
  savedAt: number;
  onRestore: () => void;
  onDiscard: () => void;
  /** Optional noun for the message, e.g. "New Patient". */
  label?: string;
}

/**
 * Inline prompt shown at the top of a form when an auto-saved draft exists for it
 * (typically because the previous session idle-timed-out mid-edit). Restores the
 * user's unsaved work, or discards it. Premium indigo, zero-orange.
 */
export function DraftRestoreBanner({ savedAt, onRestore, onDiscard, label }: Props) {
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        marginBottom: 16,
        borderRadius: 12,
        background: '#EEF2FF',
        border: '1px solid #C7D2FE',
      }}
    >
      <span style={{ display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: 9, background: '#4F46E5', color: '#fff', flexShrink: 0 }}>
        <History size={17} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#312E81' }}>
          Restore your unsaved {label ? `${label} ` : ''}work?
        </div>
        <div style={{ fontSize: 12.5, color: '#4338CA', opacity: 0.9 }}>
          We auto-saved what you were entering {timeAgo(savedAt)}.
        </div>
      </div>
      <button
        type="button"
        onClick={onRestore}
        style={{ flexShrink: 0, border: 'none', background: '#4F46E5', color: '#fff', fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 9, cursor: 'pointer' }}
      >
        Restore
      </button>
      <button
        type="button"
        aria-label="Discard saved draft"
        onClick={onDiscard}
        style={{ flexShrink: 0, display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 9, border: '1px solid #C7D2FE', background: 'transparent', color: '#4338CA', cursor: 'pointer' }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
