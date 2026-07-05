'use client';

import { useRef, useState } from 'react';
import { Download, Loader2, Paperclip, Plus, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Attachment {
  id: string;
  storageUrl: string;
  filename: string | null;
  kind: string | null;
  createdAt: string;
}

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const MAX = 10 * 1024 * 1024;

/** Compact attachments list + inline upload for the record detail page. */
export function RecordAttachments({ recordId }: { recordId: string }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: attachments = [] } = useQuery({
    queryKey: ['attachments', recordId],
    queryFn: () => api.get<Attachment[]>(`/files/record/${recordId}`).then((r) => r.data),
    enabled: !!recordId,
  });

  const refetch = () => qc.invalidateQueries({ queryKey: ['attachments', recordId] });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/files/${id}`),
    onSuccess: refetch,
  });

  const onPick = async (list: FileList | null) => {
    const f = list?.[0];
    if (!f) return;
    setError(null);
    if (!ALLOWED.includes(f.type)) { setError('File type not allowed'); return; }
    if (f.size > MAX) { setError('File exceeds 10MB'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      await api.post('/files/upload', fd, { params: { recordId }, headers: { 'Content-Type': 'multipart/form-data' } });
      refetch();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const download = (a: Attachment) => {
    const el = document.createElement('a');
    el.href = a.storageUrl;
    el.download = a.filename ?? 'download';
    if (a.storageUrl.startsWith('http')) el.target = '_blank';
    document.body.appendChild(el);
    el.click();
    el.remove();
  };

  return (
    <div>
      <div className="flex flex-col gap-2">
        {attachments.length === 0 && <div className="text-[15px] text-[#475569]">No attachments.</div>}
        {attachments.map((a) => (
          <div key={a.id} className="flex items-center gap-2 rounded-lg border border-[#F1F5F9] px-3 py-2">
            <Paperclip size={14} className="shrink-0 text-[#475569]" />
            <span className="min-w-0 flex-1 truncate text-[14px] text-[#0F172A]" title={a.filename ?? ''}>{a.filename ?? 'Untitled'}</span>
            <button onClick={() => download(a)} title="Download" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[#475569] hover:bg-[#F5F7FF] hover:text-[#4F46E5]"><Download size={14} /></button>
            <button onClick={() => del.mutate(a.id)} title="Delete" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[#475569] hover:bg-[#FEF2F2] hover:text-[#DC2626]"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>

      {error && <div className="mt-2 text-[12px] font-semibold text-[#DC2626]">{error}</div>}

      <input ref={inputRef} type="file" hidden accept={ALLOWED.join(',')} onChange={(e) => onPick(e.target.files)} />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-[#4F46E5] hover:underline disabled:opacity-60">
        {uploading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        {uploading ? 'Uploading…' : 'Attach file'}
      </button>
    </div>
  );
}
