'use client';

import { useCallback, useRef, useState } from 'react';
import { notify } from '@/lib/notify';
import { AuditFilterState } from './audit-filters';
import { AuditQueryClient } from './audit-query-client';
import {
  AuditExportRequest,
  classifyAuditExportError,
  triggerBrowserDownload,
  AUDIT_EXPORT_ERROR_COPY,
  AUDIT_EXPORT_SUCCESS_COPY,
  AUDIT_EXPORT_TRUNCATED_COPY,
} from './audit-export';

export interface UseAuditExport {
  exporting: boolean;
  /** Run one export. Returns 'ok' on a produced file, 'error' otherwise. Never throws. */
  run: (req: AuditExportRequest) => Promise<'ok' | 'error'>;
}

/**
 * Program 2 · P2-9B — governed export runner. Ephemeral, component-scoped state ONLY: nothing here
 * enters TanStack Query, Zustand, the URL, or web storage. It guards against concurrent/duplicate
 * submission, triggers the browser download from the successful artifact (then drops the blob), and
 * surfaces truthful feedback. There is NO automatic retry — each call is a fresh user-initiated act
 * (a PHI retry re-runs the confirmation upstream). Errors are classified by status only, never by body.
 */
export function useAuditExport(state: AuditFilterState): UseAuditExport {
  const [exporting, setExporting] = useState(false);
  const inFlight = useRef(false);

  const run = useCallback(
    async (req: AuditExportRequest): Promise<'ok' | 'error'> => {
      if (inFlight.current) return 'error'; // a second concurrent export is refused, never queued
      inFlight.current = true;
      setExporting(true);
      try {
        const result = await AuditQueryClient.exportAuditEvents(state, req);
        triggerBrowserDownload(result.blob, result.filename); // artifact is not retained after this
        if (result.truncated) notify.warning(AUDIT_EXPORT_TRUNCATED_COPY);
        else notify.success(AUDIT_EXPORT_SUCCESS_COPY);
        return 'ok';
      } catch (err) {
        notify.error(AUDIT_EXPORT_ERROR_COPY[classifyAuditExportError(err)]);
        return 'error';
      } finally {
        inFlight.current = false;
        setExporting(false);
      }
    },
    [state],
  );

  return { exporting, run };
}
