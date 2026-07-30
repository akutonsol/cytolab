import { createHash } from 'node:crypto';

/**
 * Program 6 · Phase 6C — the inference ADAPTER boundary (Decision 9).
 *
 * The engine orchestrates; it never knows which AI system performs inference. It depends ONLY on this interface;
 * concrete providers (OpenAI, Claude, ONNX, Torch, TensorRT, vendor scanner, …) belong to later phases. The input
 * is reference/digest only (no PHI, no bytes); the result is a digest + an opaque reference — NEVER a diagnosis,
 * disease classification, patient-facing conclusion, or medical-accuracy claim (Decision 1 / Decision 4).
 */
export interface InferenceInput {
  readonly modelVersionId: string;
  readonly inputDigest: string;
  readonly configDigest: string | null;
}

export interface InferenceAdapterResult {
  /** sha256 of the structured output — evidence without copying content. */
  readonly resultDigest: string;
  /** Opaque reference/URI to the structured output; NO bytes, NO PHI, NO diagnostic narrative. */
  readonly resultRef: string | null;
}

export interface InferenceAdapter {
  readonly adapterId: string;
  readonly adapterVersion: string;
  /** Execute inference. Must honor `signal` (abort on lease loss) and must never diagnose or claim accuracy. */
  execute(input: InferenceInput, signal?: AbortSignal): Promise<InferenceAdapterResult>;
}

/**
 * The default adapter — DETERMINISTIC and NON-CLINICAL (Decision 1 + Guardrail 2). Given identical
 * (modelVersionId, inputDigest, configDigest) it always produces identical output, which makes acceptance and
 * regression testing robust. It performs NO image analysis and makes NO medical claim: the "output" is a
 * deterministic structured provenance digest derived purely from the (already PHI-free) identity + digests.
 */
export class StubInferenceAdapter implements InferenceAdapter {
  readonly adapterId = 'stub';
  readonly adapterVersion = '1.0.0';

  async execute(input: InferenceInput): Promise<InferenceAdapterResult> {
    const resultDigest = createHash('sha256')
      .update(
        JSON.stringify({
          adapterId: this.adapterId,
          adapterVersion: this.adapterVersion,
          modelVersionId: input.modelVersionId,
          inputDigest: input.inputDigest,
          configDigest: input.configDigest ?? null,
        }),
      )
      .digest('hex');
    return { resultDigest, resultRef: `stub://inference/${resultDigest.slice(0, 16)}` };
  }
}
