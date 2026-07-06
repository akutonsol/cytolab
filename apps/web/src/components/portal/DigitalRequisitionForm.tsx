'use client';
import { useState } from 'react';
import { X } from 'lucide-react';
import { SignatureCanvas } from './SignatureCanvas';

export interface DigitalForm {
  id: string;
  formNumber: number;
  scanStatus?: string | null;
  patientName?: string | null;
  patientDob?: string | null;
  hospRegNumber?: string | null;
  doctorName?: string | null;
  doctorAddress?: string | null;
  specimenDate?: string | null;
  specimenType?: string | null;
  routineCheck?: boolean | null;
  lmp?: string | null;
  abnormalBleeding?: boolean | null;
  noPregnancies?: string | null;
  nowPregnant?: boolean | null;
  clinicalAppearance?: string | null;
  pelvicAbnormalities?: string | null;
  clinicalDiagnosis?: string | null;
  previousCytology?: boolean | null;
  hormone?: string | null;
  radiation?: string | null;
  surgical?: string | null;
  otherTherapy?: string | null;
  signatureDataUrl?: string | null;
  signedAt?: string | null;
}

const SPECIMEN_TYPES = ['SPECIMEN_16', 'ENDOCERV_ASP', 'VAG_POOL', 'CERV_SCRAP'];
const toDateInput = (d?: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');

interface Props {
  form: DigitalForm;
  onSave: (fields: Partial<DigitalForm>) => void;
  onSaveSignature: (dataUrl: string) => void;
  onClearSignature: () => void;
  onClose: () => void;
  saving?: boolean;
}

export function DigitalRequisitionForm({
  form,
  onSave,
  onSaveSignature,
  onClearSignature,
  onClose,
  saving,
}: Props) {
  const [f, setF] = useState<DigitalForm>(form);
  const update = (field: keyof DigitalForm, value: unknown) => setF((p) => ({ ...p, [field]: value }));

  const inputCls = 'w-full border-b border-gray-300 py-1 text-sm outline-none focus:border-indigo-500';
  const smallCls = 'w-full border-b border-gray-200 text-xs outline-none focus:border-indigo-400';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/50 p-4" onClick={onClose}>
      <div
        className="my-4 w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-gray-400">Cytolabs Associates Ltd.</div>
            <div className="text-2xl font-black leading-tight text-gray-900">
              CYTOLOGY<br />REQUEST<br />FORM
            </div>
            <div className="text-sm font-semibold text-gray-500">(GYNAECOLOGY)</div>
          </div>
          <div className="ml-8 flex-1 space-y-3">
            <div>
              <label className="text-xs text-gray-500">PATIENT&apos;S NAME (Surname first)</label>
              <input className={inputCls} value={f.patientName ?? ''} onChange={(e) => update('patientName', e.target.value)} />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-xs text-gray-500">D.O.B.</label>
                <input type="date" className={inputCls} value={toDateInput(f.patientDob)} onChange={(e) => update('patientDob', e.target.value)} />
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-xs text-gray-500">DOCTOR (Head of Unit)</label>
                <input className={inputCls} value={f.doctorName ?? ''} onChange={(e) => update('doctorName', e.target.value)} />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500">ADDRESS</label>
                <input className={inputCls} value={f.doctorAddress ?? ''} onChange={(e) => update('doctorAddress', e.target.value)} />
              </div>
            </div>
            <div className="flex gap-4">
              <div>
                <label className="text-xs text-gray-500">HOSP. REGISTRATION NO.</label>
                <input className="w-32 rounded border border-gray-300 px-2 py-1 text-sm" value={f.hospRegNumber ?? ''} onChange={(e) => update('hospRegNumber', e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-500">DATE OF SPECIMEN</label>
                <input type="date" className="rounded border border-gray-300 px-2 py-1 text-sm" value={toDateInput(f.specimenDate)} onChange={(e) => update('specimenDate', e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-gray-500">SPECIMEN</span>
              {SPECIMEN_TYPES.map((type) => (
                <label key={type} className="flex cursor-pointer items-center gap-1.5">
                  <input type="checkbox" checked={f.specimenType === type} onChange={() => update('specimenType', type)} className="h-4 w-4 accent-indigo-600" />
                  <span className="text-xs text-gray-700">{type.replace('_', '. ')}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Clinical + Therapy */}
        <div className="grid grid-cols-2 gap-6 border-t border-gray-200 pt-4">
          <div>
            <div className="mb-3 text-center text-xs font-bold uppercase text-gray-700">Clinical Features</div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-gray-500">
                  <input type="checkbox" checked={f.routineCheck === true} onChange={(e) => update('routineCheck', e.target.checked)} className="accent-indigo-600" />
                  Routine check
                </label>
                <label className="w-8 text-xs text-gray-500">LMP</label>
                <input className={smallCls} value={f.lmp ?? ''} onChange={(e) => update('lmp', e.target.value)} />
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-gray-500">
                  <input type="checkbox" checked={f.abnormalBleeding === true} onChange={(e) => update('abnormalBleeding', e.target.checked)} className="accent-indigo-600" />
                  Abnormal Vag. Bleeding
                </label>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">No. Pregnancies</span>
                <input className="w-12 border-b border-gray-200 text-xs outline-none" value={f.noPregnancies ?? ''} onChange={(e) => update('noPregnancies', e.target.value)} />
                <span className="text-xs text-gray-500">Now Pregnant</span>
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={f.nowPregnant === true} onChange={() => update('nowPregnant', true)} className="accent-indigo-600" />Yes
                </label>
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={f.nowPregnant === false} onChange={() => update('nowPregnant', false)} className="accent-indigo-600" />No
                </label>
              </div>
              <div>
                <label className="text-xs text-gray-500">Clinical Appearance of Cervix</label>
                <input className={smallCls} value={f.clinicalAppearance ?? ''} onChange={(e) => update('clinicalAppearance', e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-500">Pelvic Abnormalities</label>
                <input className={smallCls} value={f.pelvicAbnormalities ?? ''} onChange={(e) => update('pelvicAbnormalities', e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-500">Clinical Diagnosis</label>
                <input className={smallCls} value={f.clinicalDiagnosis ?? ''} onChange={(e) => update('clinicalDiagnosis', e.target.value)} />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">Previous Cytology</span>
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={f.previousCytology === true} onChange={() => update('previousCytology', true)} className="accent-indigo-600" />Yes
                </label>
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={f.previousCytology === false} onChange={() => update('previousCytology', false)} className="accent-indigo-600" />No
                </label>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-1 text-center text-xs font-bold uppercase text-gray-700">Therapy</div>
            <div className="mb-2 text-center text-xs text-gray-400">(Please specify type and date)</div>
            <div className="space-y-3 text-sm">
              {([
                { label: 'Hormone (last 3/12)', field: 'hormone' },
                { label: 'Radiation (Pelvic/any date)', field: 'radiation' },
                { label: 'Surgical (Pelvic/any date)', field: 'surgical' },
                { label: 'Other (trich etc.)', field: 'otherTherapy' },
              ] as const).map(({ label, field }) => (
                <div key={field}>
                  <label className="text-xs text-gray-500">{label}</label>
                  <input className={smallCls} value={(f[field] as string) ?? ''} onChange={(e) => update(field, e.target.value)} />
                </div>
              ))}

              <div className="mt-4 rounded-xl border border-gray-200 p-3">
                <div className="mb-2 text-center text-xs font-semibold text-gray-500">DR&apos;S SIGNATURE</div>
                {f.signatureDataUrl ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.signatureDataUrl} alt="Signature" className="mx-auto h-16" />
                    <button onClick={onClearSignature} className="absolute right-0 top-0 text-xs text-red-400 hover:text-red-600">
                      Clear
                    </button>
                  </div>
                ) : (
                  <SignatureCanvas onSave={onSaveSignature} />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-4">
          <button onClick={onClose} className="flex items-center gap-1 rounded-xl px-4 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-50">
            <X size={14} /> Close
          </button>
          <button
            onClick={() => onSave(f)}
            disabled={saving}
            className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-gray-300"
          >
            {saving ? 'Saving…' : 'Save Form'}
          </button>
        </div>
      </div>
    </div>
  );
}
