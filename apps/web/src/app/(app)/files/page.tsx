'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Cloud, Download, Eye, File as FileIcon, FileText, HardDrive, Image as ImageIcon,
  Search, Trash2, Upload, X,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Attachment {
  id: string;
  storageUrl: string;
  filename: string | null;
  kind: string | null;
  createdAt: string;
  record?: {
    id: string;
    labNumber: string | null;
    identifier: string;
    patient?: { firstName: string; lastName: string } | null;
  } | null;
}
interface FilesPage { data: Attachment[]; total: number; page: number; pageSize: number }
interface Stats {
  totalFiles: number;
  storageMode: 'gcs' | 'base64';
  bucket: string | null;
  byKind: { kind: string; count: number }[];
}

const isImage = (k?: string | null) => !!k && k.startsWith('image/');
const isPdf = (k?: string | null) => !!k && k.includes('pdf');
const isDoc = (k?: string | null) => !!k && (k.includes('word') || k.includes('msword'));

const typeBadge = (k?: string | null) => {
  if (isImage(k)) return { label: 'Image', bg: '#EEF2FF', color: '#4F46E5' };
  if (isPdf(k)) return { label: 'PDF', bg: '#FEF2F2', color: '#DC2626' };
  if (isDoc(k)) return { label: 'Document', bg: '#F0F9FF', color: '#0284C7' };
  return { label: 'File', bg: '#F1F5F9', color: '#64748B' };
};
const FileTypeIcon = ({ kind, size = 18 }: { kind?: string | null; size?: number }) => {
  const b = typeBadge(kind);
  const Icon = isImage(kind) ? ImageIcon : isPdf(kind) ? FileText : FileIcon;
  return <span style={{ color: b.color }}><Icon size={size} /></span>;
};

const relTime = (iso: string) => {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
};

const TYPE_FILTERS: { label: string; kind: string }[] = [
  { label: 'All types', kind: '' },
  { label: 'Images', kind: 'image' },
  { label: 'PDFs', kind: 'pdf' },
  { label: 'Documents', kind: 'word' },
];

export default function FilesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [preview, setPreview] = useState<Attachment | null>(null);
  const [confirm, setConfirm] = useState<Attachment | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const notify = (type: 'ok' | 'err', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3200); };

  const { data: stats } = useQuery({
    queryKey: ['files-stats'],
    queryFn: () => api.get<Stats>('/files/stats').then((r) => r.data),
  });
  const { data: filesPage } = useQuery({
    queryKey: ['files', kind],
    queryFn: () => api.get<FilesPage>('/files', { params: { pageSize: 200, ...(kind && { kind }) } }).then((r) => r.data),
  });

  const refetch = () => {
    qc.invalidateQueries({ queryKey: ['files'] });
    qc.invalidateQueries({ queryKey: ['files-stats'] });
  };

  const files = useMemo(() => {
    const rows = filesPage?.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((f) =>
      (f.filename ?? '').toLowerCase().includes(q) ||
      (f.record?.labNumber ?? '').toLowerCase().includes(q));
  }, [filesPage, search]);

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/files/${id}`),
    onSuccess: () => { notify('ok', 'File deleted'); setConfirm(null); refetch(); },
    onError: (e: any) => notify('err', e?.response?.data?.message ?? 'Delete failed'),
  });

  const download = (f: Attachment) => {
    const a = document.createElement('a');
    a.href = f.storageUrl;
    a.download = f.filename ?? 'download';
    if (f.storageUrl.startsWith('http')) a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const isGcs = stats?.storageMode === 'gcs';

  return (
    <div className="min-h-full" style={{ background: '#F8FAFC' }}>
      <div className="px-6 py-8 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-headline-lg text-headline-lg text-charcoal-heading">Files</h1>
            <p className="mt-1 font-body-sm text-body-sm text-secondary">Record attachments and specimen images.</p>
          </div>
          <button className="btn-primary" onClick={() => setUploadOpen(true)}><Upload size={16} /> Upload</button>
        </div>

        {/* KPI strip */}
        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="glass-card rounded-2xl p-5">
            <div className="font-display text-[30px] font-bold leading-none text-[#0F172A]">{stats?.totalFiles ?? 0}</div>
            <div className="mt-2 font-label-sm text-label-sm uppercase tracking-wider text-secondary">Total Files</div>
          </div>
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: isGcs ? '#16A34A' : '#B45309' }} />
              <div className="font-display text-[24px] font-bold leading-none text-[#0F172A]">{isGcs ? 'Google Cloud' : 'Local'}</div>
            </div>
            <div className="mt-2 font-label-sm text-label-sm uppercase tracking-wider text-secondary">Storage Mode</div>
          </div>
          <div className="glass-card rounded-2xl p-5">
            <div className="font-display text-[30px] font-bold leading-none text-[#0F172A]">{stats?.byKind.length ?? 0}</div>
            <div className="mt-2 font-label-sm text-label-sm uppercase tracking-wider text-secondary">File Types</div>
          </div>
        </div>

        {/* Storage status banner */}
        {stats && (
          isGcs ? (
            <div className="mb-5 flex items-center gap-3 rounded-2xl border px-5 py-4" style={{ background: '#F0FDF4', borderColor: '#BBF7D0' }}>
              <Cloud size={18} style={{ color: '#16A34A' }} />
              <span className="font-body-sm text-body-sm" style={{ color: '#166534' }}>
                Connected to Google Cloud Storage — {stats.bucket}
              </span>
            </div>
          ) : (
            <div className="mb-5 flex items-center gap-3 rounded-2xl border px-5 py-4" style={{ background: '#FFFBEB', borderColor: '#FDE68A' }}>
              <HardDrive size={18} style={{ color: '#B45309' }} />
              <span className="font-body-sm text-body-sm" style={{ color: '#92400E' }}>
                Using local storage — configure STORAGE_BUCKET for Google Cloud Storage.
              </span>
            </div>
          )
        )}

        {/* Filter row */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1" style={{ minWidth: 220, maxWidth: 360 }}>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by filename or lab number…"
              className="h-10 w-full rounded-xl border border-outline-variant/40 bg-white pl-9 pr-3 font-body-sm text-body-sm text-on-surface outline-none focus:border-primary"
            />
          </div>
          <select value={kind} onChange={(e) => setKind(e.target.value)}
            className="h-10 rounded-xl border border-outline-variant/40 bg-white px-3 font-body-sm text-body-sm text-on-surface outline-none focus:border-primary">
            {TYPE_FILTERS.map((t) => <option key={t.label} value={t.kind}>{t.label}</option>)}
          </select>
        </div>

        {/* Files table */}
        <div className="glass-card overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/40 bg-surface-container-low/40">
                  {['File', 'Type', 'Record', 'Patient', 'Uploaded', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-label-sm text-label-sm uppercase tracking-wider text-secondary">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {files.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <Upload size={44} className="text-[#E2E8F0]" />
                        <p className="font-headline-sm text-headline-sm text-charcoal-heading">No files yet</p>
                        <p className="font-body-sm text-body-sm text-secondary">Upload record attachments to see them here.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  files.map((f) => {
                    const badge = typeBadge(f.kind);
                    return (
                      <tr key={f.id} className="border-b border-surface-container-low transition-colors hover:bg-surface-container-low/50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <FileTypeIcon kind={f.kind} />
                            <span className="max-w-[220px] truncate font-body-sm text-body-sm font-semibold text-charcoal-heading" title={f.filename ?? ''}>{f.filename ?? 'Untitled'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span style={{ background: badge.bg, color: badge.color }} className="inline-block whitespace-nowrap rounded-full px-2.5 py-1 font-label-sm text-label-sm font-medium">{badge.label}</span>
                        </td>
                        <td className="px-4 py-3">
                          {f.record ? (
                            <Link href={`/records/${f.record.id}`} className="inline-block rounded-md bg-primary-fixed px-2 py-0.5 font-mono text-[13px] text-primary hover:underline">
                              {f.record.labNumber ?? f.record.identifier}
                            </Link>
                          ) : <span className="font-body-sm text-body-sm text-secondary">—</span>}
                        </td>
                        <td className="px-4 py-3 font-body-sm text-[13px] text-secondary">
                          {f.record?.patient ? `${f.record.patient.firstName} ${f.record.patient.lastName}` : '—'}
                        </td>
                        <td className="px-4 py-3 font-body-sm text-body-sm text-secondary" title={new Date(f.createdAt).toLocaleString()}>{relTime(f.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => setPreview(f)} title="Preview" className="grid h-8 w-8 place-items-center rounded-lg text-secondary hover:bg-surface-container-low hover:text-primary"><Eye size={15} /></button>
                            <button onClick={() => download(f)} title="Download" className="grid h-8 w-8 place-items-center rounded-lg text-secondary hover:bg-surface-container-low hover:text-primary"><Download size={15} /></button>
                            <button onClick={() => setConfirm(f)} title="Delete" className="grid h-8 w-8 place-items-center rounded-lg text-secondary hover:bg-error-container hover:text-error"><Trash2 size={15} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {uploadOpen && <UploadModal onClose={() => setUploadOpen(false)} onUploaded={() => { refetch(); notify('ok', 'File uploaded'); }} onError={(m) => notify('err', m)} />}

      {preview && <PreviewModal file={preview} onClose={() => setPreview(null)} onDownload={() => download(preview)} />}

      {confirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(4px)' }} onClick={() => setConfirm(null)}>
          <div className="w-full max-w-[420px] rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">Delete “{confirm.filename}”?</h3>
            <p className="mt-2 font-body-sm text-body-sm text-secondary">This permanently removes the file.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="btn-primary" style={{ background: '#DC2626', boxShadow: '0 4px 12px rgba(220,38,38,0.2)' }} disabled={del.isPending} onClick={() => del.mutate(confirm.id)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[120] rounded-xl px-4 py-3 text-[14px] font-semibold text-white shadow-lg" style={{ background: toast.type === 'ok' ? '#16A34A' : '#DC2626' }}>{toast.msg}</div>
      )}
    </div>
  );
}

// ── Preview modal ──────────────────────────────────────────────────────────
function PreviewModal({ file, onClose, onDownload }: { file: Attachment; onClose: () => void; onDownload: () => void }) {
  const gcs = file.storageUrl.startsWith('http');
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-[720px] flex-col rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-outline-variant/30 p-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <FileTypeIcon kind={file.kind} />
            <span className="truncate font-headline-sm text-headline-sm text-charcoal-heading">{file.filename}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onDownload} title="Download" className="grid h-8 w-8 place-items-center rounded-lg text-secondary hover:bg-surface-container-low"><Download size={16} /></button>
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-secondary hover:bg-surface-container-low"><X size={16} /></button>
          </div>
        </div>
        <div className="min-h-[240px] overflow-auto p-4">
          {isImage(file.kind) ? (
            <img src={file.storageUrl} alt={file.filename ?? ''} style={{ maxWidth: '100%', display: 'block', margin: '0 auto', borderRadius: 8 }} />
          ) : isPdf(file.kind) ? (
            <iframe src={file.storageUrl} title={file.filename ?? 'PDF'} style={{ width: '100%', height: '60vh', border: 'none', borderRadius: 8 }} />
          ) : (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <FileTypeIcon kind={file.kind} size={48} />
              <p className="font-body-sm text-body-sm text-secondary">Preview isn’t available for this file type.</p>
              {gcs ? (
                <a href={file.storageUrl} target="_blank" rel="noreferrer" className="btn-secondary">Open in new tab</a>
              ) : (
                <button className="btn-secondary" onClick={onDownload}>Download</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Upload modal (drag & drop) ─────────────────────────────────────────────
const MAX = 10 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

function UploadModal({ onClose, onUploaded, onError }: { onClose: () => void; onUploaded: () => void; onError: (m: string) => void }) {
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [labSearch, setLabSearch] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<{ id: string; labNumber: string | null } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: records } = useQuery({
    queryKey: ['files-record-picker'],
    queryFn: () => api.get('/specimens', { params: { pageSize: 100 } }).then((r) => r.data.data as { id: string; labNumber: string | null; patient?: { firstName: string; lastName: string } }[]),
    enabled: !!labSearch,
  });
  const matches = useMemo(() => {
    const q = labSearch.trim().toLowerCase();
    if (!q) return [];
    return (records ?? []).filter((r) => (r.labNumber ?? '').toLowerCase().includes(q)).slice(0, 6);
  }, [records, labSearch]);

  const validate = (f: File): string | null => {
    if (!ALLOWED.includes(f.type)) return `File type ${f.type || 'unknown'} not allowed`;
    if (f.size > MAX) return 'File exceeds 10MB limit';
    return null;
  };
  const handleFiles = (list: FileList | null) => {
    const f = list?.[0];
    if (!f) return;
    const err = validate(f);
    if (err) { onError(err); return; }
    setFile(f);
  };

  const doUpload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.post('/files/upload', fd, {
        params: selectedRecord ? { recordId: selectedRecord.id } : undefined,
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => { if (e.total) setProgress(Math.round((e.loaded / e.total) * 100)); },
      });
      onUploaded();
      onClose();
    } catch (e: any) {
      onError(e?.response?.data?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-[520px] rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">Upload File</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-secondary hover:bg-surface-container-low"><X size={16} /></button>
        </div>

        <input ref={inputRef} type="file" hidden accept={ALLOWED.join(',')} onChange={(e) => handleFiles(e.target.files)} />

        {!file ? (
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
            style={{
              border: `2px dashed ${dragOver ? '#4F46E5' : '#CBD5E1'}`,
              borderRadius: 16, padding: '40px 24px', textAlign: 'center', cursor: 'pointer',
              background: dragOver ? '#EEF2FF' : '#F8FAFC', transition: 'all 0.15s',
            }}>
            <Upload size={32} color={dragOver ? '#4F46E5' : '#94A3B8'} style={{ margin: '0 auto' }} />
            <p className="mt-3 font-headline-sm text-headline-sm text-charcoal-heading">Drop files here or click to browse</p>
            <p className="mt-1 font-body-sm text-body-sm text-secondary">Images, PDFs, Word docs up to 10MB</p>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-outline-variant/30 bg-surface-container-low p-4">
            <FileTypeIcon kind={file.type} size={24} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-body-sm text-body-sm font-semibold text-charcoal-heading">{file.name}</div>
              <div className="font-label-sm text-label-sm text-secondary">{(file.size / 1024).toFixed(0)} KB</div>
            </div>
            {!uploading && <button onClick={() => setFile(null)} className="grid h-8 w-8 place-items-center rounded-lg text-secondary hover:bg-white"><X size={15} /></button>}
          </div>
        )}

        {/* Optional record link */}
        <div className="mt-4">
          <label className="mb-1.5 block font-label-md text-label-md text-on-surface">Link to a record (optional)</label>
          {selectedRecord ? (
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-primary-fixed px-2 py-1 font-mono text-[13px] text-primary">{selectedRecord.labNumber ?? selectedRecord.id.slice(0, 8)}</span>
              <button onClick={() => setSelectedRecord(null)} className="font-label-sm text-label-sm text-secondary hover:underline">Change</button>
            </div>
          ) : (
            <div className="relative">
              <input
                value={labSearch}
                onChange={(e) => setLabSearch(e.target.value)}
                placeholder="Search lab number…"
                className="h-10 w-full rounded-xl border border-outline-variant/40 bg-white px-3 font-body-sm text-body-sm text-on-surface outline-none focus:border-primary"
              />
              {matches.length > 0 && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-outline-variant/30 bg-white shadow-lg">
                  {matches.map((r) => (
                    <button key={r.id} onClick={() => { setSelectedRecord(r); setLabSearch(''); }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-surface-container-low">
                      <span className="font-mono text-[13px] text-primary">{r.labNumber ?? r.id.slice(0, 8)}</span>
                      <span className="font-body-sm text-body-sm text-secondary">{r.patient ? `${r.patient.firstName} ${r.patient.lastName}` : ''}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {uploading && (
          <div className="mt-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-low">
              <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: '#4F46E5' }} />
            </div>
            <div className="mt-1 text-right font-label-sm text-label-sm text-secondary">{progress}%</div>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose} disabled={uploading}>Cancel</button>
          <button className="btn-primary" disabled={!file || uploading} style={{ opacity: !file || uploading ? 0.5 : 1 }} onClick={doUpload}>
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}
