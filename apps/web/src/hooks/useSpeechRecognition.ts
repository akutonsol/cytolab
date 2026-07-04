'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseSpeechRecognitionOptions {
  continuous?: boolean;
  interimResults?: boolean;
  language?: string;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'Microphone access denied. Please allow microphone in browser settings.',
  'no-speech': 'No speech detected. Try again.',
  network: 'Network error. Check connection.',
  'audio-capture': 'No microphone found. Check your device.',
  'service-not-allowed': 'Speech service is not allowed. Check browser settings.',
  aborted: 'Dictation stopped.',
};

/** Thin wrapper over the Web Speech API with auto-restart + friendly errors. */
export function useSpeechRecognition(options: UseSpeechRecognitionOptions = {}) {
  const { continuous = true, interimResults = true, language = 'en-US' } = options;

  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const shouldListenRef = useRef(false);
  const startRef = useRef<() => void>(() => {});
  // Keep the latest callbacks without re-creating the recognition instance.
  const cbRef = useRef(options);
  cbRef.current = options;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsSupported(!!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));
  }, []);

  const start = useCallback(() => {
    if (typeof window === 'undefined') return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR || recognitionRef.current) return;

    const rec = new SR();
    rec.continuous = continuous;
    rec.interimResults = interimResults;
    rec.lang = language;

    rec.onresult = (event: any) => {
      let interim = '';
      let finalChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const text = res[0]?.transcript ?? '';
        if (res.isFinal) finalChunk += text;
        else interim += text;
      }
      if (finalChunk) {
        setTranscript((prev) => prev + finalChunk);
        cbRef.current.onResult?.(finalChunk.trim(), true);
      }
      setInterimTranscript(interim);
      if (interim) cbRef.current.onResult?.(interim, false);
    };

    rec.onerror = (event: any) => {
      const code = event?.error ?? 'unknown';
      if (code === 'aborted') return; // normal stop, not surfaced
      const msg = ERROR_MESSAGES[code] ?? `Speech recognition error: ${code}`;
      setError(msg);
      cbRef.current.onError?.(msg);
      if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') {
        shouldListenRef.current = false;
      }
    };

    rec.onend = () => {
      recognitionRef.current = null;
      setInterimTranscript('');
      if (shouldListenRef.current) {
        // Chrome ends recognition periodically; restart to stay continuous.
        startRef.current();
      } else {
        setIsListening(false);
        cbRef.current.onEnd?.();
      }
    };

    recognitionRef.current = rec;
    try {
      rec.start();
      setIsListening(true);
      setError(null);
    } catch {
      recognitionRef.current = null;
    }
  }, [continuous, interimResults, language]);

  startRef.current = start;

  const startListening = useCallback(() => {
    shouldListenRef.current = true;
    setError(null);
    start();
  }, [start]);

  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    const rec = recognitionRef.current;
    if (rec) { try { rec.stop(); } catch { /* noop */ } }
    setIsListening(false);
    setInterimTranscript('');
  }, []);

  const resetTranscript = useCallback(() => { setTranscript(''); setInterimTranscript(''); }, []);

  // Cleanup on unmount.
  useEffect(() => () => {
    shouldListenRef.current = false;
    const rec = recognitionRef.current;
    if (rec) { try { rec.stop(); } catch { /* noop */ } }
    recognitionRef.current = null;
  }, []);

  return { isListening, isSupported, transcript, interimTranscript, startListening, stopListening, resetTranscript, error };
}
