'use client';

import { forwardRef, useRef, useState, type Ref } from 'react';
import { DictationButton, type DictationButtonHandle } from './DictationButton';

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  showDictation?: boolean;
  dictationPosition?: 'top-right' | 'bottom-right';
  dictationRef?: Ref<DictationButtonHandle>;
};

/** A <textarea> with a built-in corner dictation button. Dictated final text is
 *  appended (with a separating space); interim text previews in muted italic. */
export const DictationTextarea = forwardRef<HTMLTextAreaElement, Props>(function DictationTextarea(
  { showDictation = true, dictationPosition = 'top-right', dictationRef, value, onChange, className = '', ...rest },
  ref,
) {
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const valueRef = useRef<string>((value as string) ?? '');
  valueRef.current = (value as string) ?? '';

  const base = (value as string) ?? '';
  const sep = (s: string) => (s && !s.endsWith(' ') && !s.endsWith('\n') ? ' ' : '');
  const display = interim ? `${base}${sep(base)}${interim}` : base;

  const appendFinal = (text: string) => {
    if (!text) { setInterim(''); return; }
    const cur = valueRef.current;
    onChange?.({ target: { value: `${cur}${sep(cur)}${text}` } } as any);
    setInterim('');
  };

  const posCls = dictationPosition === 'top-right' ? 'right-2 top-2' : 'right-2 bottom-2';

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={display}
        onChange={(e) => { if (!interim) onChange?.(e); }}
        readOnly={!!interim}
        className={`${className} ${showDictation ? 'pr-10' : ''} ${interim ? 'italic text-slate-400 opacity-60' : ''} ${listening ? 'ring-2 ring-indigo-300' : ''}`}
        {...rest}
      />
      {showDictation && (
        <div className={`absolute ${posCls}`}>
          <DictationButton ref={dictationRef} size="sm" onTranscript={appendFinal} onInterim={setInterim} onListeningChange={setListening} />
        </div>
      )}
    </div>
  );
});
