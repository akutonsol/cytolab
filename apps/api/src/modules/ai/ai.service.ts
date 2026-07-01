import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Locked default (lab-overridable via LabAiSettings.model). See design doc.
export const DEFAULT_AI_MODEL = 'claude-sonnet-4-6';
const CALL_TIMEOUT_MS = 20_000;
const MAX_TOKENS = 1500;

export interface AiCallResult {
  /** false whenever AI could not produce output — the workflow proceeds regardless. */
  available: boolean;
  reason?: string;
  output?: string;
  model?: string;
}

/**
 * Thin Anthropic wrapper with TOTAL graceful degradation: it NEVER throws. Any
 * problem — no API key, disabled, timeout, network/API error, empty response —
 * returns { available: false, reason }. AI is strictly assistive, so the
 * authorization workflow is never blocked by it.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly apiKey?: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('ANTHROPIC_API_KEY') || undefined;
  }

  /** Whether a key is configured. (Per-lab `enabled` is checked by the caller.) */
  hasApiKey(): boolean {
    return !!this.apiKey;
  }

  async generate(params: { system: string; user: string; model?: string }): Promise<AiCallResult> {
    if (!this.apiKey) return { available: false, reason: 'AI is not configured (no API key)' };
    const model = params.model || DEFAULT_AI_MODEL;
    try {
      const output = await this.withTimeout(this.callModel(model, params.system, params.user), CALL_TIMEOUT_MS);
      if (!output || !output.trim()) return { available: false, reason: 'Empty response from model' };
      return { available: true, output: output.trim(), model };
    } catch (err: any) {
      // Never propagate — degrade.
      this.logger.warn(`AI generation unavailable: ${err?.message ?? err}`);
      return { available: false, reason: err?.message ?? 'AI unavailable' };
    }
  }

  /** The raw model call. Isolated so tests can stub it without touching the network. */
  protected async callModel(model: string, system: string, user: string): Promise<string> {
    const client = new Anthropic({ apiKey: this.apiKey });
    const res = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      temperature: 0.2,
      system,
      messages: [{ role: 'user', content: user }],
    });
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
  }

  private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error('AI request timed out')), ms);
      timer.unref?.(); // don't keep the event loop alive on the timer alone
    });
    // Clear the pending timer once the race settles so it never leaks.
    return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
  }
}
