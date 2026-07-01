import { cn } from './cn';
import { ChevronDown } from './icons';

interface PillSelectProps {
  value?: string;
  options: string[];
  onChange?: (value: string) => void;
  className?: string;
}

/** Compact pill dropdown ("Week ⌄" / "Year ⌄") recurring in card title rows. */
export function PillSelect({ value, options, onChange, className }: PillSelectProps) {
  return (
    <div
      className={cn(
        'relative inline-flex items-center gap-1.5 rounded-pill border border-border-strong bg-surface px-3 py-1.5 text-xs font-semibold text-text',
        className,
      )}
    >
      <select
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className="absolute inset-0 cursor-pointer appearance-none bg-transparent text-transparent opacity-0"
        aria-label="Range"
      >
        {options.map((o) => (
          <option key={o} value={o} className="text-text">
            {o}
          </option>
        ))}
      </select>
      <span>{value ?? options[0]}</span>
      <ChevronDown className="text-text-tertiary" />
    </div>
  );
}
