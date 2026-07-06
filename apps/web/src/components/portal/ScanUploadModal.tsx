'use client';
import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Scan, Upload, X, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { portalApi } from '@/lib/portal-api';

interface CreatedForm {
  id: string;
  formNumber: number;
}
interface FormStatus {
  formId: string;
  scanStatus: string | null;
  ocrConfidence: number | null;
  needsReview: boolean;
}

interface Props {
  batchId: string;
  onClose: () => void;
  onDone: () => void;
}

const DONE = new Set(['EXTRACTED', 'NEEDS_REVIEW', 'CONFIRMED']);

export function ScanUploadModal({ batchId, onClose, onDone }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [created, setCreated] = useState<CreatedForm[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const upload = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      const res = await portalApi.post(`/portal/batches/${batchId}/scan`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data as CreatedForm[];
    },
    onSuccess: (forms) => setCreated(forms),
  });

  // Poll extraction status until every uploaded form settles.
  const { data: statuses } = useQuery({
    queryKey: ['portal-scan-status', batchId, created.map((c) => c.id).join(',')],
    enabled: created.length > 0,
    refetchInterval: (q) => {
      const data = q.state.data as FormStatus[] | undefined;
      const allDone = data && data.every((s) => s.scanStatus && DONE.has(s.scanStatus));
      return allDone ? false : 1500;
    },
    queryFn: async () => {
      const results = await Promise.all(
        created.map((c) =>
          portalApi.get(`/portal/batches/${batchId}/scan/${c.id}/status`).then((r) => r.data as FormStatus),
        ),
      );
      return results;
    },
  });

  const confirm = useMutation({
    mutationFn: async () => {
      await Promise.all(
        created.map((c) => portalApi.post(`/portal/batches/${batchId}/forms/${c.id}/confirm`)),
      );
    },
    onSuccess: () => {
      onDone();
      onClose();
    },
  });

  const pickFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
  };

  const allSettled = statuses && statuses.every((s) => s.scanStatus && DONE.has(s.scanStatus));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scan size={18} className="text-indigo-600" />
            <h2 className="text-lg font-bold text-gray-900">Scan &amp; Upload Forms</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {created.length === 0 ? (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFiles(e.dataTransfer.files); }}
              onClick={() => inputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
                dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300'
              }`}
            >
              <Upload size={28} className="mb-3 text-indigo-400" />
              <div className="font-semibold text-gray-900">Drag &amp; drop paper forms</div>
              <div className="mt-1 text-sm text-gray-500">PDF, JPG or PNG — AI extracts the data</div>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="application/pdf,image/jpeg,image/png"
                className="hidden"
                onChange={(e) => pickFiles(e.target.files)}
              />
            </div>

            {files.length > 0 && (
              <div className="mt-4 space-y-1">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                    <span className="truncate text-gray-700">{f.name}</span>
                    <button onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => upload.mutate()}
              disabled={files.length === 0 || upload.isPending}
              className="mt-5 w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:bg-gray-300"
            >
              {upload.isPending ? 'Uploading…' : `Upload ${files.length || ''} form${files.length === 1 ? '' : 's'}`}
            </button>
          </>
        ) : (
          <>
            <div className="space-y-2">
              {created.map((c) => {
                const s = statuses?.find((x) => x.formId === c.id);
                const done = s?.scanStatus && DONE.has(s.scanStatus);
                const low = s?.needsReview;
                const conf = s?.ocrConfidence != null ? Math.round(s.ocrConfidence * 100) : null;
                return (
                  <div
                    key={c.id}
                    className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                      low ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm">
                      {!done ? (
                        <Loader2 size={16} className="animate-spin text-indigo-500" />
                      ) : low ? (
                        <AlertCircle size={16} className="text-indigo-600" />
                      ) : (
                        <CheckCircle2 size={16} className="text-emerald-600" />
                      )}
                      <span className="font-medium text-gray-800">Form {c.formNumber}</span>
                    </div>
                    <span className="text-xs text-gray-500">
                      {!done ? 'Extracting…' : low ? `Needs review${conf != null ? ` · ${conf}%` : ''}` : `Extracted${conf != null ? ` · ${conf}%` : ''}`}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-gray-400">
              Low-confidence fields are flagged for review — you can correct them after adding to the batch.
            </p>
            <button
              onClick={() => confirm.mutate()}
              disabled={!allSettled || confirm.isPending}
              className="mt-5 w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:bg-gray-300"
            >
              {confirm.isPending ? 'Adding…' : 'Confirm & Add to Batch'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
