'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileText, Scan, Trash2, Pencil, ChevronRight, CheckCircle2, Circle,
  CreditCard, Building2, FileCheck, Check, Download, ArrowLeft,
} from 'lucide-react';
import { portalApi } from '@/lib/portal-api';
import { DigitalRequisitionForm, DigitalForm } from '@/components/portal/DigitalRequisitionForm';
import { ScanUploadModal } from '@/components/portal/ScanUploadModal';
import { SignatureCanvas } from '@/components/portal/SignatureCanvas';

interface Batch {
  id: string;
  batchNumber: string;
  status: string;
  totalForms: number;
  totalAmountCents: number;
  paymentMethod: string | null;
  paymentStatus: string;
  notes: string | null;
  forms: DigitalForm[];
}

const FEE_PER_FORM = 2500; // J$ display value
const money = (jd: number) => `J$${jd.toLocaleString()}`;
const isProcessing = (s?: string | null) => s === 'UPLOADING' || s === 'PROCESSING';
const formReady = (f: DigitalForm) => !!(f.patientName && f.specimenType && f.signatureDataUrl);

const PAY_OPTIONS = [
  { method: 'CARD', icon: CreditCard, label: 'Credit/Debit Card', sub: 'Visa, Mastercard — instant confirmation' },
  { method: 'BANK_TRANSFER', icon: Building2, label: 'Bank Transfer', sub: 'NCB / Scotiabank — 1-2 business days' },
  { method: 'CHEQUE', icon: FileCheck, label: 'Cheque', sub: 'Payable to Cytolabs Associates Ltd.' },
] as const;

export default function BatchEditorPage() {
  const { batchId } = useParams<{ batchId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [editForm, setEditForm] = useState<DigitalForm | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [signAllOpen, setSignAllOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const { data: batch } = useQuery({
    queryKey: ['portal-batch', batchId],
    queryFn: () => portalApi.get(`/portal/batches/${batchId}`).then((r) => r.data as Batch),
    refetchInterval: (q) => {
      const b = q.state.data as Batch | undefined;
      return b?.forms?.some((f) => isProcessing(f.scanStatus)) ? 2500 : false;
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['portal-batch', batchId] });

  const addForm = useMutation({
    mutationFn: () => portalApi.post(`/portal/batches/${batchId}/forms`).then((r) => r.data as DigitalForm),
    onSuccess: (form) => { invalidate(); setEditForm(form); },
  });
  const saveForm = useMutation({
    mutationFn: (vars: { id: string; fields: Partial<DigitalForm> }) =>
      portalApi.patch(`/portal/batches/${batchId}/forms/${vars.id}`, vars.fields).then((r) => r.data),
    onSuccess: () => { invalidate(); setEditForm(null); },
  });
  const deleteForm = useMutation({
    mutationFn: (id: string) => portalApi.delete(`/portal/batches/${batchId}/forms/${id}`),
    onSuccess: invalidate,
  });
  const saveSig = useMutation({
    mutationFn: (vars: { id: string; dataUrl: string }) =>
      portalApi.post(`/portal/batches/${batchId}/forms/${vars.id}/signature`, { signatureDataUrl: vars.dataUrl }),
    onSuccess: (_d, vars) => {
      invalidate();
      setEditForm((f) => (f && f.id === vars.id ? { ...f, signatureDataUrl: vars.dataUrl } : f));
    },
  });
  const clearSig = useMutation({
    mutationFn: (id: string) => portalApi.delete(`/portal/batches/${batchId}/forms/${id}/signature`),
    onSuccess: (_d, id) => {
      invalidate();
      setEditForm((f) => (f && f.id === id ? { ...f, signatureDataUrl: null } : f));
    },
  });
  const setPaymentMethod = useMutation({
    mutationFn: (m: string) => portalApi.patch(`/portal/batches/${batchId}`, { paymentMethod: m }),
    onSuccess: invalidate,
  });
  const submit = useMutation({
    mutationFn: async () => {
      if (batch?.paymentMethod === 'CARD' && batch.paymentStatus !== 'PAID') {
        await portalApi.post(`/portal/batches/${batchId}/payment/confirm`, {});
      }
      return portalApi.post(`/portal/batches/${batchId}/submit`).then((r) => r.data);
    },
    onSuccess: () => { invalidate(); setSubmitted(true); },
  });

  const signAll = useMutation({
    mutationFn: async (dataUrl: string) => {
      const unsigned = (batch?.forms ?? []).filter((f) => !f.signatureDataUrl);
      await Promise.all(
        unsigned.map((f) => portalApi.post(`/portal/batches/${batchId}/forms/${f.id}/signature`, { signatureDataUrl: dataUrl })),
      );
    },
    onSuccess: () => { invalidate(); setSignAllOpen(false); },
  });

  const downloadManifest = async () => {
    const res = await portalApi.get(`/portal/batches/${batchId}/manifest`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${batch?.batchNumber}-manifest.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!batch) return <div className="py-16 text-center text-gray-400">Loading…</div>;

  const readyCount = batch.forms.filter(formReady).length;

  // ── Confirmation ──
  if (submitted) {
    return (
      <div className="py-12 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 size={40} className="text-emerald-600" />
        </div>
        <h1 className="mb-2 text-2xl font-black text-gray-900">Batch Submitted!</h1>
        <p className="mb-6 text-gray-500">Your {batch.totalForms} requisitions have been received by Cytolab.</p>
        <div className="mx-auto mb-6 max-w-sm rounded-2xl bg-gray-50 p-5 text-left text-sm">
          <div className="flex justify-between py-1"><span className="text-gray-500">Batch Number</span><span className="font-bold text-indigo-600">{batch.batchNumber}</span></div>
          <div className="flex justify-between py-1"><span className="text-gray-500">Forms</span><span className="font-semibold">{batch.totalForms}</span></div>
          <div className="flex justify-between py-1"><span className="text-gray-500">Payment</span><span className="font-semibold">{batch.paymentMethod}</span></div>
        </div>
        <div className="flex justify-center gap-3">
          <button onClick={downloadManifest} className="flex items-center gap-2 rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            <Download size={15} /> Download Manifest
          </button>
          <button onClick={() => router.push('/portal/requisitions')} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
            View All Batches
          </button>
        </div>
      </div>
    );
  }

  const STEPS = ['Add Forms', 'Review & Sign', 'Payment & Submit'];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <button onClick={() => router.push('/portal/requisitions')} className="mb-2 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={14} /> All batches
        </button>
        <h1 className="font-display text-[26px] font-bold tracking-tight text-[#0F172A]">{batch.batchNumber}</h1>
      </div>

      {/* Step tabs */}
      <div className="inline-flex rounded-xl border border-[#EEF2F7] bg-[#F1F4F7] p-1">
        {STEPS.map((label, i) => (
          <button
            key={label}
            onClick={() => setStep(i + 1)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              step === i + 1 ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>

      {/* Step 1 — Add Forms */}
      {step === 1 && (
        <div>
          <div className="mb-6 flex gap-4">
            <button onClick={() => addForm.mutate()} className="flex-1 rounded-2xl border-2 border-dashed border-indigo-200 p-8 text-center transition-colors hover:border-indigo-400 hover:bg-indigo-50">
              <FileText size={32} className="mx-auto mb-3 text-indigo-400" />
              <div className="font-semibold text-gray-900">Enter Manually</div>
              <div className="mt-1 text-sm text-gray-500">Fill in the digital form</div>
            </button>
            <button onClick={() => setScanOpen(true)} className="flex-1 rounded-2xl border-2 border-dashed border-teal-200 p-8 text-center transition-colors hover:border-teal-400 hover:bg-teal-50">
              <Scan size={32} className="mx-auto mb-3 text-teal-500" />
              <div className="font-semibold text-gray-900">Scan &amp; Upload</div>
              <div className="mt-1 text-sm text-gray-500">Upload paper forms — AI extracts data</div>
            </button>
          </div>

          <div className="space-y-2">
            {batch.forms.map((f) => (
              <div key={f.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-xs font-bold text-indigo-600">{f.formNumber}</div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{f.patientName || 'Untitled patient'}</div>
                    <div className="text-xs text-gray-500">
                      {isProcessing(f.scanStatus) ? 'AI extracting…' : (f.specimenType?.replace('_', '. ') ?? 'No specimen type')}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {formReady(f) ? <CheckCircle2 size={16} className="text-emerald-600" /> : <Circle size={16} className="text-gray-300" />}
                  <button onClick={() => setEditForm(f)} className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50"><Pencil size={14} /></button>
                  <button onClick={() => deleteForm.mutate(f.id)} className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
            {batch.forms.length === 0 && <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">No forms yet — add one above.</div>}
          </div>
        </div>
      )}

      {/* Step 2 — Review & Sign */}
      {step === 2 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-700">{readyCount}/{batch.forms.length} forms ready</div>
            <button onClick={() => setSignAllOpen(true)} className="rounded-xl border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50">
              Sign All Unsigned
            </button>
          </div>
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wider text-gray-400">
                  <th className="px-4 py-3 font-semibold">#</th>
                  <th className="px-4 py-3 font-semibold">Patient</th>
                  <th className="px-4 py-3 font-semibold">Specimen</th>
                  <th className="px-4 py-3 font-semibold">Signed</th>
                  <th className="px-4 py-3 font-semibold text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {batch.forms.map((f) => (
                  <tr key={f.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer" onClick={() => setEditForm(f)}>
                    <td className="px-4 py-3 text-gray-500">{f.formNumber}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{f.patientName || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{f.specimenType?.replace('_', '. ') ?? '—'}</td>
                    <td className="px-4 py-3">{f.signatureDataUrl ? <Check size={15} className="text-emerald-600" /> : <span className="text-xs text-gray-400">—</span>}</td>
                    <td className="px-4 py-3 text-right">
                      {formReady(f)
                        ? <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" title="Ready" />
                        : <span className="inline-flex h-2.5 w-2.5 rounded-full bg-red-400" title="Missing required fields" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Step 3 — Payment & Submit */}
      {step === 3 && (
        <div className="mx-auto max-w-lg">
          <h2 className="mb-6 text-lg font-bold text-gray-900">Payment &amp; Submission</h2>
          <div className="mb-6 rounded-2xl bg-gray-50 p-5">
            <div className="mb-2 flex justify-between"><span className="text-sm text-gray-600">Total forms</span><span className="font-semibold">{batch.totalForms}</span></div>
            <div className="mb-2 flex justify-between"><span className="text-sm text-gray-600">Processing fee per form</span><span className="font-semibold">{money(FEE_PER_FORM)}</span></div>
            <div className="mt-2 flex justify-between border-t border-gray-200 pt-2">
              <span className="font-bold text-gray-900">Total</span>
              <span className="text-xl font-black text-indigo-600">{money(batch.totalForms * FEE_PER_FORM)}</span>
            </div>
          </div>

          <div className="mb-6 space-y-3">
            <div className="mb-2 text-sm font-semibold text-gray-700">Select Payment Method</div>
            {PAY_OPTIONS.map(({ method, icon: Icon, label, sub }) => {
              const active = batch.paymentMethod === method;
              return (
                <button
                  key={method}
                  onClick={() => setPaymentMethod.mutate(method)}
                  className={`flex w-full items-center gap-4 rounded-xl border-2 p-4 transition-colors ${active ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <Icon size={20} className={active ? 'text-indigo-600' : 'text-gray-400'} />
                  <div className="text-left">
                    <div className={`text-sm font-semibold ${active ? 'text-indigo-700' : 'text-gray-900'}`}>{label}</div>
                    <div className="text-xs text-gray-500">{sub}</div>
                  </div>
                  {active && <Check size={16} className="ml-auto text-indigo-600" />}
                </button>
              );
            })}
          </div>

          {batch.paymentMethod === 'BANK_TRANSFER' && (
            <div className="mb-6 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm">
              <div className="mb-2 font-semibold text-blue-900">Bank Transfer Details</div>
              <div className="space-y-1 text-blue-800">
                <div>Bank: <strong>NCB Jamaica</strong></div>
                <div>Account Name: <strong>Cytolabs Associates Ltd.</strong></div>
                <div>Account No: <strong>123-456-789</strong></div>
                <div>Reference: <strong>{batch.batchNumber}</strong></div>
              </div>
            </div>
          )}
          {batch.paymentMethod === 'CHEQUE' && (
            <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              <div className="mb-2 font-semibold text-gray-900">Cheque Instructions</div>
              Make cheque payable to <strong>Cytolabs Associates Ltd.</strong><br />
              Write batch reference <strong>{batch.batchNumber}</strong> on the back.<br />
              Deliver with physical specimens.
            </div>
          )}

          <button
            onClick={() => submit.mutate()}
            disabled={!batch.paymentMethod || submit.isPending || batch.totalForms === 0 || readyCount !== batch.forms.length}
            className="w-full rounded-2xl bg-indigo-600 py-4 text-base font-bold text-white transition-colors hover:bg-indigo-700 disabled:bg-gray-300"
          >
            {submit.isPending ? 'Submitting…' : `Submit ${batch.totalForms} Requisitions`}
          </button>
          {readyCount !== batch.forms.length && (
            <p className="mt-2 text-center text-xs text-red-500">All forms must be complete and signed before submitting.</p>
          )}
          <p className="mt-3 text-center text-xs text-gray-400">
            By submitting you confirm all patient data is accurate and you are authorized to submit these requisitions.
          </p>
        </div>
      )}

      {/* Modals */}
      {editForm && (
        <DigitalRequisitionForm
          form={editForm}
          saving={saveForm.isPending}
          onSave={(fields) => saveForm.mutate({ id: editForm.id, fields })}
          onSaveSignature={(dataUrl) => saveSig.mutate({ id: editForm.id, dataUrl })}
          onClearSignature={() => clearSig.mutate(editForm.id)}
          onClose={() => setEditForm(null)}
        />
      )}
      {scanOpen && <ScanUploadModal batchId={batchId} onClose={() => setScanOpen(false)} onDone={invalidate} />}
      {signAllOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSignAllOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-sm font-bold text-gray-900">Sign all unsigned forms</div>
            <p className="mb-3 text-xs text-gray-500">This signature will be applied to every form without one.</p>
            <SignatureCanvas onSave={(dataUrl) => signAll.mutate(dataUrl)} />
          </div>
        </div>
      )}
    </div>
  );
}
