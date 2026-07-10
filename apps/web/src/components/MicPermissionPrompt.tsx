'use client';

import { createPortal } from 'react-dom';
import { Mic, MicOff, X } from 'lucide-react';
import { Button, IconAction } from '@/components/ui';

interface Props {
  open: boolean;
  mode: 'ask' | 'denied';
  onAllow?: () => void;
  onClose: () => void;
}

/** Shown before the first dictation (explains the mic request) and again with
 *  browser-specific help if permission was denied. */
export function MicPermissionPrompt({ open, mode, onAllow, onClose }: Props) {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 2300, background: 'rgba(15,23,42,0.55)' }} onClick={onClose}>
      <div className="w-full max-w-[440px] rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className={`grid h-10 w-10 place-items-center rounded-xl ${mode === 'ask' ? 'bg-indigo-100 text-indigo-700' : 'bg-[#FEF2F2] text-[#DC2626]'}`}>
              {mode === 'ask' ? <Mic size={20} /> : <MicOff size={20} />}
            </span>
            <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">{mode === 'ask' ? 'Enable voice dictation' : 'Microphone blocked'}</h3>
          </div>
          <IconAction icon={<X size={16} />} tone="strong" className="text-secondary" onClick={onClose} />
        </div>

        {mode === 'ask' ? (
          <>
            <p className="font-body-sm text-body-sm text-secondary">
              Cytolab will ask your browser for microphone access. Click <span className="font-semibold text-on-surface">Allow</span> in the prompt that appears, then start speaking — your words are transcribed into the field. Nothing is recorded or sent to a server; transcription runs in your browser.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>Not now</Button>
              <Button onClick={onAllow}><Mic size={15} /> Allow &amp; dictate</Button>
            </div>
          </>
        ) : (
          <>
            <p className="font-body-sm text-body-sm text-secondary">Microphone access is blocked. To use dictation, re-enable it for this site:</p>
            <ul className="mt-3 flex flex-col gap-2 font-body-sm text-body-sm text-on-surface">
              <li><span className="font-semibold">Chrome:</span> click the 🔒 / camera icon in the address bar → allow Microphone → reload.</li>
              <li><span className="font-semibold">Safari:</span> Safari → Settings for This Website → Microphone → Allow.</li>
              <li><span className="font-semibold">Firefox:</span> click the mic icon left of the address bar → clear the block → retry.</li>
            </ul>
            <div className="mt-6 flex justify-end">
              <Button onClick={onClose}>Got it</Button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
