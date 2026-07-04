'use client';

import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { Loader2, Mic, MicOff } from 'lucide-react';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useDictationContext } from '@/lib/dictation-context';
import { useFeatures } from '@/lib/feature-context';
import { MicPermissionPrompt } from './MicPermissionPrompt';

export interface DictationButtonHandle { toggle: () => void; }

interface Props {
  onTranscript: (text: string) => void;
  onInterim?: (text: string) => void;
  onListeningChange?: (listening: boolean) => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  insertMode?: 'append' | 'replace';
}

const SIZES: Record<NonNullable<Props['size']>, { box: number; icon: number }> = {
  sm: { box: 28, icon: 15 }, md: { box: 36, icon: 18 }, lg: { box: 44, icon: 22 },
};
const SEEN_KEY = 'dictation-mic-seen';

export const DictationButton = forwardRef<DictationButtonHandle, Props>(function DictationButton(
  { onTranscript, onInterim, onListeningChange, className = '', size = 'md', insertMode = 'append' },
  ref,
) {
  const id = useId();
  const { activeDictationId, setActive } = useDictationContext();
  const { isEnabled } = useFeatures();
  const [prompt, setPrompt] = useState<null | 'ask' | 'denied'>(null);
  const [processing, setProcessing] = useState(false);
  const cbRef = useRef({ onTranscript, onInterim });
  cbRef.current = { onTranscript, onInterim };

  const { isListening, isSupported, startListening, stopListening, error } = useSpeechRecognition({
    onResult: (text, isFinal) => { if (isFinal) { if (text) cbRef.current.onTranscript(text); } else cbRef.current.onInterim?.(text); },
    onError: (e) => { if (/denied|not allowed/i.test(e)) setPrompt('denied'); },
    onEnd: () => setProcessing(false),
  });

  // Register/clear this button in the global dictation context.
  useEffect(() => {
    if (isListening) setActive(id);
    else if (activeDictationId === id) setActive(null);
    onListeningChange?.(isListening);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isListening]);
  useEffect(() => () => { if (activeDictationId === id) setActive(null); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = useCallback(() => {
    if (!isSupported) return;
    if (isListening) { setProcessing(true); stopListening(); return; }
    if (typeof window !== 'undefined' && !localStorage.getItem(SEEN_KEY)) { setPrompt('ask'); return; }
    startListening();
  }, [isSupported, isListening, startListening, stopListening]);

  const allow = () => { if (typeof window !== 'undefined') localStorage.setItem(SEEN_KEY, '1'); setPrompt(null); startListening(); };

  useImperativeHandle(ref, () => ({ toggle }), [toggle]);

  // Feature-gated: when Voice-to-Text is disabled for the lab, render nothing.
  if (!isEnabled('VOICE_TO_TEXT')) return null;

  const { box, icon } = SIZES[size];
  const denied = !!error && /denied|not allowed/i.test(error);

  const title = !isSupported
    ? 'Voice input requires Chrome or Safari. This browser does not support the Web Speech API.'
    : denied
      ? 'Microphone access denied — click for help.'
      : isListening
        ? 'Listening… click to stop'
        : 'Click to dictate';

  let color = '#64748B'; // slate idle
  if (!isSupported) color = '#94A3B8';
  else if (denied) color = '#DC2626';
  else if (isListening) color = '#4F46E5';

  return (
    <>
      <button
        type="button"
        onClick={denied ? () => setPrompt('denied') : toggle}
        disabled={!isSupported}
        title={title}
        aria-label={title}
        className={`relative grid shrink-0 place-items-center rounded-lg transition-colors ${isSupported ? 'hover:bg-slate-100' : 'cursor-not-allowed opacity-60'} ${isListening ? 'bg-indigo-50' : ''} ${className}`}
        style={{ width: box, height: box, color }}
      >
        {processing ? <Loader2 size={icon} className="animate-spin" /> : !isSupported || denied ? <MicOff size={icon} /> : <Mic size={icon} />}
        {isListening && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full" style={{ background: '#EF4444' }} />}
      </button>
      <MicPermissionPrompt open={prompt !== null} mode={prompt === 'denied' ? 'denied' : 'ask'} onAllow={allow} onClose={() => setPrompt(null)} />
    </>
  );
});
