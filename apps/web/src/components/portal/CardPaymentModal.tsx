'use client';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CreditCard, Loader2, X, Lock } from 'lucide-react';
import { portalApi } from '@/lib/portal-api';
import { validateCallbackMessage, expectedCallbackOrigin } from '@/lib/portal/callback-message';

interface Props {
  batchId: string;
  amountLabel: string;
  onClose: () => void;
  onPaid: () => void;
}

type Phase = 'form' | 'challenge' | 'processing' | 'error';

interface InitiateResult {
  requiresRedirect?: boolean;
  redirectData?: string;
  paid?: boolean;
  error?: string;
}

export function CardPaymentModal({ batchId, amountLabel, onClose, onPaid }: Props) {
  const [phase, setPhase] = useState<Phase>('form');
  const [error, setError] = useState<string | null>(null);
  const [redirectData, setRedirectData] = useState<string | null>(null);
  const [card, setCard] = useState({ cardholderName: '', cardPan: '', cardExpiration: '', cardCvv: '' });
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const wroteFor = useRef<string | null>(null);

  const set = (k: keyof typeof card, v: string) => setCard((p) => ({ ...p, [k]: v }));

  const initiate = useMutation({
    mutationFn: () =>
      portalApi.post(`/portal/batches/${batchId}/payment/initiate`, { paymentMethod: 'CARD', ...card }).then((r) => r.data as InitiateResult),
    onSuccess: (res) => {
      if (res.requiresRedirect && res.redirectData) {
        setRedirectData(res.redirectData);
        setPhase('challenge');
      } else if (res.paid) {
        onPaid();
      } else {
        setError(res.error ?? 'Payment could not be completed');
        setPhase('error');
      }
    },
    onError: (e: any) => {
      setError(e?.response?.data?.message ?? 'Payment could not be started');
      setPhase('error');
    },
  });

  // Render the 3DS RedirectData into an about:blank iframe via contentDocument
  // (so PowerTranz's auto-submit form runs inside the frame, not a download).
  useEffect(() => {
    if (phase !== 'challenge' || !redirectData) return;
    if (wroteFor.current === redirectData) return;
    const doc = iframeRef.current?.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(redirectData);
    doc.close();
    wroteFor.current = redirectData;
  }, [phase, redirectData]);

  // The callback HTML postMessages the parent when 3DS auth completes. Accept the
  // message ONLY from the expected origin + the active iframe window, with a supported
  // status for THIS batch (R-004b). The authenticated status poll below remains the
  // source of payment truth, so an ignored message only fails to advance a UI phase.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const valid = validateCallbackMessage(e, {
        expectedOrigin: expectedCallbackOrigin(),
        expectedSource: iframeRef.current?.contentWindow ?? null,
        batchId,
      });
      if (!valid) return;
      if (valid.status === 'payment_processing') setPhase('processing');
      else {
        setError(valid.message ?? 'Payment was declined');
        setPhase('error');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [batchId]);

  // Poll payment status once the challenge is underway (also catches the
  // frictionless server-to-server callback where postMessage never fires).
  useQuery({
    queryKey: ['portal-pay-status', batchId],
    enabled: phase === 'challenge' || phase === 'processing',
    refetchInterval: (q) => {
      const s = (q.state.data as { paymentStatus?: string } | undefined)?.paymentStatus;
      return s === 'PAID' || s === 'FAILED' ? false : 2000;
    },
    queryFn: async () => {
      const data = (await portalApi.get(`/portal/batches/${batchId}/payment/status`)).data as { paymentStatus: string };
      if (data.paymentStatus === 'PAID') onPaid();
      else if (data.paymentStatus === 'FAILED') { setError('Payment was declined'); setPhase('error'); }
      return data;
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard size={18} className="text-indigo-600" />
            <h2 className="text-lg font-bold text-gray-900">Card Payment</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {phase === 'form' && (
          <>
            <div className="mb-4 rounded-xl bg-gray-50 p-3 text-sm">
              <span className="text-gray-600">Amount due</span>
              <span className="float-right font-bold text-indigo-600">{amountLabel}</span>
            </div>
            <div className="space-y-3">
              <input className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500" placeholder="Cardholder name" value={card.cardholderName} onChange={(e) => set('cardholderName', e.target.value)} />
              <input className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500" placeholder="Card number" inputMode="numeric" value={card.cardPan} onChange={(e) => set('cardPan', e.target.value)} />
              <div className="flex gap-3">
                <input className="flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500" placeholder="MM/YY" value={card.cardExpiration} onChange={(e) => set('cardExpiration', e.target.value)} />
                <input className="w-24 rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500" placeholder="CVV" inputMode="numeric" value={card.cardCvv} onChange={(e) => set('cardCvv', e.target.value)} />
              </div>
            </div>
            <button
              onClick={() => initiate.mutate()}
              disabled={initiate.isPending || !card.cardPan || !card.cardCvv || !card.cardExpiration || !card.cardholderName}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:bg-gray-300"
            >
              {initiate.isPending ? <Loader2 size={16} className="animate-spin" /> : <Lock size={14} />}
              {initiate.isPending ? 'Starting…' : `Pay ${amountLabel}`}
            </button>
            <p className="mt-2 text-center text-[11px] text-gray-400">Secured by PowerTranz 3-D Secure</p>
          </>
        )}

        {phase === 'challenge' && (
          <div>
            <p className="mb-3 text-sm text-gray-600">Complete the verification from your bank below.</p>
            <iframe ref={iframeRef} title="3-D Secure" className="h-80 w-full rounded-xl border border-gray-200" />
          </div>
        )}

        {phase === 'processing' && (
          <div className="flex flex-col items-center py-10">
            <Loader2 size={28} className="mb-3 animate-spin text-indigo-500" />
            <p className="text-sm text-gray-600">Finalizing payment…</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="py-6 text-center">
            <p className="mb-4 text-sm text-red-500">{error}</p>
            <button onClick={() => { setPhase('form'); setError(null); }} className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
