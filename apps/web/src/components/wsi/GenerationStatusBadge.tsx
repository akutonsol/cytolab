import { Badge, statusPresentation, WSI_GENERATION } from '@/components/ui';
import type { GenerationStatus } from '@/lib/wsi-review';

/** A generation-lifecycle status pill. Colour + label come from the single WSI_GENERATION token map
 *  (zero-orange; QC failure is danger, not amber). State is conveyed by the label text, not colour alone. */
export function GenerationStatusBadge({ status, size = 'sm' }: { status: GenerationStatus; size?: 'xs' | 'sm' | 'md' }) {
  const p = statusPresentation(WSI_GENERATION, status);
  const Icon = p.icon;
  return (
    <Badge tone={p.tone} size={size} icon={Icon ? <Icon size={12} aria-hidden /> : undefined}>
      {p.label}
    </Badge>
  );
}
