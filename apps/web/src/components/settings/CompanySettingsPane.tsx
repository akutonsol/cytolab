'use client';

import { useEffect, useRef, useState } from 'react';
import { ImageUp, Loader2, Microscope, Save, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, Input, fieldClass, cn } from '@/components/ui';
import { notify } from '@/lib/notify';

interface LabProfile {
  name: string;
  tagline: string | null;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  currency: string;
}

const FIELD_LABEL = 'mb-1 block font-label-sm text-label-sm text-secondary';

// Logo rules — matched to the square chips the mark renders into across the app
// (login 64px, dashboard 36px, portal 34px). Non-square uploads distort, so we
// normalise every upload to a transparent square PNG before it leaves the browser.
const LOGO_ACCEPT = ['image/png', 'image/jpeg', 'image/webp'];
const LOGO_MAX_INPUT = 5 * 1024 * 1024; // guard before we even read the file
const LOGO_CANVAS = 512; // output edge — retina-crisp at every render size

const CURRENCIES = ['JMD', 'USD', 'TTD', 'BBD', 'GBP', 'EUR', 'CAD'];

/**
 * Reads an uploaded image and re-renders it, aspect-preserved and centered, onto
 * a transparent LOGO_CANVAS square. This is the "automatic adjustment" — the lab
 * uploads any square-ish logo and we hand back a clean, correctly-sized PNG.
 */
function squarePngFromFile(file: File): Promise<{ blob: Blob; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    if (!LOGO_ACCEPT.includes(file.type)) {
      reject(new Error('Logo must be a PNG, JPEG or WEBP image'));
      return;
    }
    if (file.size > LOGO_MAX_INPUT) {
      reject(new Error('Image is over 5MB — please use a smaller file'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (img.width < 64 || img.height < 64) {
        reject(new Error('Logo should be at least 64×64px for a crisp result'));
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = LOGO_CANVAS;
      canvas.height = LOGO_CANVAS;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not process image'));
        return;
      }
      // Contain: scale to fit the square, center, leave the rest transparent.
      const scale = Math.min(LOGO_CANVAS / img.width, LOGO_CANVAS / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, (LOGO_CANVAS - w) / 2, (LOGO_CANVAS - h) / 2, w, h);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Could not process image'));
          return;
        }
        resolve({ blob, dataUrl: canvas.toDataURL('image/png') });
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image'));
    };
    img.src = url;
  });
}

// A rounded logo chip that mirrors the dashboard/login mark. Shows the uploaded
// logo when present, otherwise the default microscope mark on the brand gradient.
function LogoChip({ src, size, dark = false }: { src: string | null; size: number; dark?: boolean }) {
  const radius = Math.round(size * 0.28);
  if (src) {
    return (
      <span
        style={{ width: size, height: size, borderRadius: radius, background: dark ? 'rgba(255,255,255,0.08)' : '#EEF2FF' }}
        className="grid shrink-0 place-items-center overflow-hidden"
      >
        <img src={src} alt="Logo preview" style={{ width: size, height: size, objectFit: 'contain' }} />
      </span>
    );
  }
  return (
    <span
      style={{ width: size, height: size, borderRadius: radius, background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)', color: '#fff', boxShadow: '0 6px 16px rgba(79,70,229,0.3)' }}
      className="grid shrink-0 place-items-center"
    >
      <Microscope size={Math.round(size * 0.55)} strokeWidth={1.9} />
    </span>
  );
}

/**
 * Settings > General > Company. Lab identity + contact details. The logo and
 * tagline set here brand the dashboard shell (and, later, the login screen).
 */
export function CompanySettingsPane() {
  const qc = useQueryClient();
  const { data } = useQuery<LabProfile>({ queryKey: ['lab-profile'], queryFn: () => api.get('/lab/profile').then((r) => r.data) });

  const [form, setForm] = useState<Partial<LabProfile>>({});
  // Local preview of a just-processed logo before it is saved to the server.
  const [pendingLogo, setPendingLogo] = useState<{ blob: Blob; dataUrl: string } | null>(null);
  const [processing, setProcessing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (data) setForm({
      name: data.name ?? '',
      tagline: data.tagline ?? '',
      address: data.address ?? '',
      phone: data.phone ?? '',
      email: data.email ?? '',
      currency: data.currency ?? 'JMD',
    });
  }, [data]);

  const previewLogo = pendingLogo?.dataUrl ?? data?.logoUrl ?? null;
  const previewName = (form.name?.trim() || 'CYTOLAB');
  const previewTagline = (form.tagline?.trim() || 'Cytology & Pathology Laboratory System');

  const onPickFile = async (file?: File) => {
    if (!file) return;
    setProcessing(true);
    try {
      const result = await squarePngFromFile(file);
      setPendingLogo(result);
    } catch (e: any) {
      notify.error(e?.message ?? 'Could not process image');
    } finally {
      setProcessing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Refetch both the settings form and the app-shell branding so the dashboard
  // logo/name/tagline update in this tab immediately (other tabs get the socket).
  const refetchBranding = () => {
    qc.invalidateQueries({ queryKey: ['lab-profile'] });
    qc.invalidateQueries({ queryKey: ['lab-branding'] });
  };

  const uploadLogo = useMutation({
    mutationFn: async () => {
      if (!pendingLogo) return;
      const fd = new FormData();
      fd.append('file', pendingLogo.blob, 'logo.png');
      await api.post('/lab/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => { notify.success('Logo updated'); setPendingLogo(null); refetchBranding(); },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Logo upload failed'),
  });

  const removeLogo = useMutation({
    mutationFn: () => api.delete('/lab/logo'),
    onSuccess: () => { notify.success('Logo removed'); setPendingLogo(null); refetchBranding(); },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Could not remove logo'),
  });

  const saveProfile = useMutation({
    mutationFn: () => api.put('/lab/profile', {
      name: form.name,
      tagline: form.tagline ?? '',
      address: form.address ?? '',
      phone: form.phone ?? '',
      email: form.email ?? '',
      currency: form.currency,
    }),
    onSuccess: () => { notify.success('Company details saved'); refetchBranding(); },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Save failed'),
  });

  return (
    <div className="max-w-[720px]">
      <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">Company</h3>
      <p className="mt-1 font-body-sm text-body-sm text-secondary">
        Your lab’s identity. The logo and tagline set here brand the dashboard, and are used on your reports.
      </p>

      {/* ── Brand identity ─────────────────────────────────────────── */}
      <div className="mt-6 rounded-2xl border border-outline-variant p-5">
        <div className="font-label-md text-label-md text-charcoal-heading">Brand identity</div>

        <div className="mt-4 flex flex-wrap items-start gap-6">
          {/* Uploader */}
          <div className="flex items-start gap-4">
            <LogoChip src={previewLogo} size={72} />
            <div>
              <input
                ref={fileRef}
                type="file"
                accept={LOGO_ACCEPT.join(',')}
                className="hidden"
                onChange={(e) => onPickFile(e.target.files?.[0])}
              />
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={processing} className="flex items-center gap-2">
                  {processing ? <Loader2 size={14} className="animate-spin" /> : <ImageUp size={14} />} Choose logo
                </Button>
                {pendingLogo && (
                  <Button loading={uploadLogo.isPending} disabled={uploadLogo.isPending} onClick={() => uploadLogo.mutate()} className="flex items-center gap-2">
                    <Save size={14} /> Save logo
                  </Button>
                )}
                {(data?.logoUrl || pendingLogo) && (
                  <Button variant="ghost" onClick={() => (pendingLogo ? setPendingLogo(null) : removeLogo.mutate())} disabled={removeLogo.isPending} className="flex items-center gap-2 text-secondary">
                    <Trash2 size={14} /> {pendingLogo ? 'Discard' : 'Remove'}
                  </Button>
                )}
              </div>
              <p className="mt-2 font-body-sm text-body-sm text-secondary">
                Square PNG, JPEG or WEBP. We auto-crop to a {LOGO_CANVAS}×{LOGO_CANVAS} square and keep transparency — minimum 64×64px.
              </p>
              {pendingLogo && <p className="mt-1 font-label-sm text-label-sm text-indigo-600">Adjusted and ready — click “Save logo” to apply.</p>}
            </div>
          </div>
        </div>

        {/* Live preview in both shells */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-outline-variant bg-white p-3">
            <div className="mb-2 font-label-sm text-label-sm uppercase tracking-wider text-outline">Dashboard</div>
            <div className="flex items-center gap-3">
              <LogoChip src={previewLogo} size={36} />
              <div style={{ lineHeight: 1.1 }}>
                <div style={{ fontFamily: 'Geist, sans-serif', fontSize: 18, fontWeight: 700, letterSpacing: 0.5, color: '#111827' }}>{previewName}</div>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#1f2937', marginTop: 1 }}>{previewTagline}</div>
              </div>
            </div>
          </div>
          <div className="rounded-xl p-3" style={{ background: '#1435d1' }}>
            <div className="mb-2 font-label-sm text-label-sm uppercase tracking-wider text-white/60">Login</div>
            <div className="flex items-center gap-3">
              <LogoChip src={previewLogo} size={44} dark />
              <div style={{ lineHeight: 1.1 }} className="text-white">
                <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em', textTransform: 'uppercase' }}>{previewName}</div>
                <div style={{ fontSize: 12.5, fontWeight: 500, marginTop: 2 }} className="text-white/85">{previewTagline}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <span className={FIELD_LABEL}>Company name</span>
            <Input family="reference" border="outline" placeholder="CYTOLAB" value={form.name ?? ''} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <span className={FIELD_LABEL}>Tagline</span>
            <Input family="reference" border="outline" placeholder="Cytology & Pathology Laboratory System" maxLength={60} value={form.tagline ?? ''} onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))} />
            <p className="mt-1 font-label-sm text-label-sm text-outline">{(form.tagline?.length ?? 0)}/60</p>
          </div>
        </div>
      </div>

      {/* ── Contact details ────────────────────────────────────────── */}
      <div className="mt-4 rounded-2xl border border-outline-variant p-5">
        <div className="font-label-md text-label-md text-charcoal-heading">Contact details</div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <span className={FIELD_LABEL}>Address</span>
            <Input family="reference" border="outline" placeholder="12 Constant Spring Rd, Kingston" value={form.address ?? ''} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </div>
          <div>
            <span className={FIELD_LABEL}>Phone</span>
            <Input family="reference" border="outline" placeholder="(876) 555-0100" value={form.phone ?? ''} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <span className={FIELD_LABEL}>Email</span>
            <Input family="reference" border="outline" type="email" placeholder="hello@cytolab.com" value={form.email ?? ''} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <span className={FIELD_LABEL}>Currency</span>
            <select
              className={cn(fieldClass({ family: 'reference', border: 'outline' }), 'w-full')}
              value={form.currency ?? 'JMD'}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <Button loading={saveProfile.isPending} disabled={saveProfile.isPending} onClick={() => saveProfile.mutate()} className="flex items-center gap-2">
          <Save size={14} /> Save changes
        </Button>
      </div>
    </div>
  );
}
