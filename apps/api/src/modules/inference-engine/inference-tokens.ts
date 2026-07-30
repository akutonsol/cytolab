import { InferenceConfig } from './inference-config';

/** DI token for the resolved inference-engine configuration. */
export const INFERENCE_CONFIG = Symbol('INFERENCE_CONFIG');

/** DI token for the pluggable inference adapter (Decision 9 — the engine never names a provider). */
export const INFERENCE_ADAPTER = Symbol('INFERENCE_ADAPTER');

/**
 * Orchestration-engine version — recorded immutably on every InferenceRecord (Decision 10) so an execution is
 * reproducible from audit even as the engine or the underlying model evolves. Bump on any change to the execution
 * contract or terminalization semantics.
 */
export const INFERENCE_ENGINE_VERSION = '6c.1.0';

export type { InferenceConfig };
