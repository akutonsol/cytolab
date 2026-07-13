// Premium UI design foundation — reusable primitives.
export { cn } from './cn';
export { CHART, COLOR } from './tokens';
export * from './icons';
export { Avatar } from './Avatar';
export { AvatarStack, type StackAvatar } from './AvatarStack';
export { IconButton } from './IconButton';
export { StatCard } from './StatCard';
export { PastelCard } from './PastelCard';
export { StatusBadge } from './StatusBadge';
export { SectionCard } from './SectionCard';
export { PillSelect } from './PillSelect';
export { Gauge } from './Gauge';
export { BarChart, type BarDatum } from './BarChart';
export { LineChart, type LineSeries } from './LineChart';
export { MiniAreaChart } from './MiniAreaChart';
export { DataTable, UserCell, StackedCell, type Column } from './DataTable';
export { AppShell, type RailItem, type TopItem } from './AppShell';

// ── Core primitives (Sprint 4) ────────────────────────────────────────────
// Prefer these over hand-written class strings. They consume semantic (Tier 2),
// domain (Tier 2.5) and motion tokens only — never a raw hex, shadow or curve.
export { Card, cardClass, type CardProps, type CardStyle } from './Card';
export { Button, IconAction, compactButtonClass, type ButtonProps, type IconActionProps } from './Button';
export { Input, fieldClass, type InputProps, type FieldStyle } from './Input';
export { Badge, type BadgeProps } from './Badge';
export { Th, Td, Tr, type ThProps, type TdProps, type TrProps } from './Table';
export { EmptyState, TableEmpty, type EmptyStateProps, type TableEmptyProps } from './EmptyState';
export { Skeleton, SkeletonText, SkeletonRows, SkeletonStat, type SkeletonProps } from './Skeleton';
export { PageHeader, type PageHeaderProps } from './PageHeader';
export { SectionContainer, type SectionContainerProps } from './SectionContainer';

// ── Overlays + status presentation (P2) ────────────────────────────────────
// Accessible dialog primitives (Portal + focus-trap + Escape + scroll-lock + focus
// restore) and the single domain status→presentation source. Presentation only.
export { Modal, type ModalProps } from './Modal';
export { Drawer, type DrawerProps } from './Drawer';
export {
  statusPresentation,
  type StatusTone,
  type StatusPresentation,
  RECORD_STATUS,
  RECALL_STATUS,
  ESCALATION_STATUS,
  ESCALATION_SEVERITY,
  QC_RESULT,
  QC_ALERT_STATUS,
  PROFICIENCY_STATUS,
  SYSTEM_HEALTH_STATUS,
} from './status-tokens';
