'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Modal, Button, cn } from '@/components/ui';
import { AuditFilterState } from '@/lib/audit/audit-filters';
import { AuditExportFormat, AuditExportProjection } from '@/lib/audit/audit-export';
import { useAuditExport } from '@/lib/audit/use-audit-export';
import { AuditExportPhiConfirm } from './AuditExportPhiConfirm';

/**
 * Program 2 · P2-9B — the governed export dialog. Ephemeral state only. It ALWAYS initializes to
 * projection=base + format=csv on open (reopening forgets any prior PHI intent/consent). Base export
 * runs on confirm; PHI export routes through the distinct AuditExportPhiConfirm step. Nothing here is
 * persisted, cached, or written to the URL; closing clears the sensitive selection.
 */

const FORMATS: { value: AuditExportFormat; label: string; hint: string }[] = [
  { value: 'csv', label: 'CSV', hint: 'Spreadsheet-friendly' },
  { value: 'ndjson', label: 'NDJSON', hint: 'One JSON record per line' },
];
const PROJECTIONS: { value: AuditExportProjection; label: string; hint: string }[] = [
  { value: 'base', label: 'Standard', hint: 'No patient references' },
  { value: 'phi', label: 'Include PHI', hint: 'Patient references (recorded)' },
];

/** Mirror the backend default resolution: a system reader's UNSPECIFIED scope resolves to SYSTEM,
 *  a lab reader's to their own lab. Never shows lab ids — only the human-readable shape. */
function scopeSummary(state: AuditFilterState, canSystem: boolean): string {
  switch (state.scope) {
    case 'SYSTEM':
      return 'System (platform events)';
    case 'CROSS_LAB': {
      const n = state.labIds?.length ?? 0;
      return `Cross-lab (${n} lab${n === 1 ? '' : 's'})`;
    }
    case 'LAB':
      return 'Your lab';
    default:
      return canSystem ? 'System (platform events)' : 'Your lab';
  }
}

function RadioGroup<T extends string>({
  name,
  legend,
  value,
  onChange,
  options,
  disabled,
}: {
  name: string;
  legend: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; hint: string }[];
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{legend}</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <label
              key={o.value}
              className={cn(
                'flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 transition-colors duration-fast ease-standard',
                active ? 'border-primary bg-primary-soft/40' : 'border-slate-200 hover:bg-slate-50',
                disabled && 'cursor-not-allowed opacity-60',
                'focus-within:ring-2 focus-within:ring-primary/40',
              )}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={active}
                onChange={() => onChange(o.value)}
                className="mt-0.5 accent-primary"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-800">{o.label}</span>
                <span className="block text-xs text-slate-500">{o.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function AuditExportDialog({
  open,
  onOpenChange,
  state,
  canPhi,
  canSystem,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: AuditFilterState;
  canPhi: boolean;
  canSystem: boolean;
}) {
  const [format, setFormat] = useState<AuditExportFormat>('csv');
  const [projection, setProjection] = useState<AuditExportProjection>('base');
  const [phiConfirmOpen, setPhiConfirmOpen] = useState(false);
  const { exporting, run } = useAuditExport(state);

  // Reset on every open: base projection + CSV, and forget any prior PHI confirmation.
  useEffect(() => {
    if (open) {
      setFormat('csv');
      setProjection('base');
      setPhiConfirmOpen(false);
    }
  }, [open]);

  const close = () => onOpenChange(false);

  const onConfirm = async () => {
    if (projection === 'phi') {
      setPhiConfirmOpen(true); // distinct confirmation step — no request yet
      return;
    }
    const r = await run({ format, projection: 'base' });
    if (r === 'ok') close();
  };

  const onPhiConfirm = async () => {
    const r = await run({ format, projection: 'phi' });
    if (r === 'ok') {
      setPhiConfirmOpen(false);
      close();
    }
  };

  return (
    <>
      <Modal
        open={open}
        onOpenChange={(o) => {
          if (!exporting) onOpenChange(o);
        }}
        title="Export audit events"
        description="The current audit filters and scope will be exported."
        closeOnEscape={!exporting}
        closeOnBackdrop={!exporting}
        footer={
          <>
            <Button variant="ghost" size="sm" disabled={exporting} onClick={close}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Download size={15} />}
              disabled={exporting}
              loading={exporting && projection === 'base'}
              loadingLabel="Preparing…"
              onClick={onConfirm}
            >
              {projection === 'phi' ? 'Continue…' : 'Export'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <RadioGroup
            name="audit-export-format"
            legend="Format"
            value={format}
            onChange={setFormat}
            options={FORMATS}
            disabled={exporting}
          />
          {canPhi && (
            <RadioGroup
              name="audit-export-projection"
              legend="Data"
              value={projection}
              onChange={setProjection}
              options={PROJECTIONS}
              disabled={exporting}
            />
          )}
          <dl className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-500">Scope</dt>
              <dd className="font-medium text-slate-800">{scopeSummary(state, canSystem)}</dd>
            </div>
          </dl>
          <p className="text-xs text-slate-500">
            Large result sets are capped at the server maximum and may be truncated — you’ll be told if that happens.
          </p>
        </div>
      </Modal>

      {canPhi && (
        <AuditExportPhiConfirm
          open={phiConfirmOpen}
          onOpenChange={(o) => {
            if (!exporting) setPhiConfirmOpen(o);
          }}
          formatLabel={format === 'csv' ? 'CSV' : 'NDJSON'}
          exporting={exporting}
          onConfirm={onPhiConfirm}
        />
      )}
    </>
  );
}
