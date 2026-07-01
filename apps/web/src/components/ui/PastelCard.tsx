import type { ReactNode } from 'react';
import { cn } from './cn';
import { IconButton } from './IconButton';
import { AvatarStack, type StackAvatar } from './AvatarStack';
import { ArrowUpRight } from './icons';

type Tone = 'lavender' | 'sky' | 'peach';

interface PastelCardProps {
  tone: Tone;
  label: string;
  title: ReactNode;
  /** Small secondary meta line, e.g. "Emily Parker · Colds". */
  meta?: ReactNode;
  /** Overlapping avatar stack (bottom-left) — mutually placed with `value`. */
  avatars?: StackAvatar[];
  /** Big number at the bottom-left (e.g. 16, 5). */
  value?: ReactNode;
  onAction?: () => void;
  className?: string;
}

const TONES: Record<Tone, string> = {
  lavender: 'bg-pastel-lavender',
  sky: 'bg-pastel-sky',
  peach: 'bg-pastel-peach',
};

/**
 * The dashboard's signature soft attention card: tinted background, quiet label,
 * a bold short line, optional avatar stack or big number, and a dark circular
 * arrow button in the bottom-right corner.
 */
export function PastelCard({ tone, label, title, meta, avatars, value, onAction, className }: PastelCardProps) {
  return (
    <div className={cn('relative flex min-h-[168px] flex-col rounded-card p-5', TONES[tone], className)}>
      <span className="text-label font-medium text-text-secondary">{label}</span>
      <div className="mt-2 text-[15px] font-bold leading-snug text-text">{title}</div>
      {meta && <div className="mt-1.5 text-meta text-text-secondary">{meta}</div>}

      <div className="mt-auto flex items-end justify-between pt-4">
        <div>
          {value !== undefined && <span className="text-stat font-extrabold text-text">{value}</span>}
          {avatars && avatars.length > 0 && <AvatarStack avatars={avatars} />}
        </div>
        <IconButton variant="dark" size="md" icon={<ArrowUpRight />} onClick={onAction} aria-label="Open" />
      </div>
    </div>
  );
}
