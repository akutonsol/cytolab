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
export { Button, IconAction, type ButtonProps, type IconActionProps } from './Button';
export { Input, fieldClass, type InputProps, type FieldStyle } from './Input';
export { Badge, type BadgeProps } from './Badge';
export { Th, Td, Tr, type ThProps, type TdProps, type TrProps } from './Table';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { SectionContainer, type SectionContainerProps } from './SectionContainer';
