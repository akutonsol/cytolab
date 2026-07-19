'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/components/ui';

/** Program 2 · P2-8D — accessible, keyboard-operable copy affordance for an opaque value. */
export function CopyValue({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="break-all font-mono text-xs text-slate-700">{value}</span>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Copied' : `Copy ${value}`}
        className="rounded p-1 text-slate-400 transition-colors duration-fast ease-standard hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {copied ? <Check size={13} className="text-primary" /> : <Copy size={13} />}
      </button>
    </span>
  );
}
