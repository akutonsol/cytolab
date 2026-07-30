import { createHash } from 'node:crypto';
import { ExplainabilityArtifactKind, ExplainabilityRegionType } from '@prisma/client';

/**
 * Program 6 · Phase 6D — the explainability GENERATOR boundary (Decision 13).
 *
 * The service orchestrates; it never knows which system produces explanations. It depends ONLY on this interface;
 * concrete providers (saliency, Grad-CAM, attention, ONNX, Torch, scanner-vendor, external service) are NOT
 * authorized in 6D. Inputs are the record's immutable identity + provenance digests (no PHI, no bytes); outputs are
 * coded/numeric structured content + digests/references — NEVER a diagnosis, correctness, accuracy, or confidence claim.
 */
export interface ExplainabilityGenerationRequest {
  readonly recordUuid: string;
  readonly inputDigest: string | null;
  readonly resultDigest: string | null;
  readonly configDigest: string | null;
  readonly kinds: ExplainabilityArtifactKind[];
  readonly slide: { width: number | null; height: number | null } | null;
}

export interface GeneratedRegion {
  regionType: ExplainabilityRegionType;
  categoryCode: string;
  geometry: unknown;
  weight?: number | null;
  ordinal: number;
}
export interface GeneratedProbability {
  classCode: string;
  value: number;
  ordinal: number;
}
export interface GeneratedArtifact {
  kind: ExplainabilityArtifactKind;
  contentDigest: string;
  contentRef: string | null;
  regions?: GeneratedRegion[];
  probabilities?: GeneratedProbability[];
}

export interface ExplainabilityGenerator {
  readonly generatorId: string;
  readonly generatorVersion: string;
  generate(req: ExplainabilityGenerationRequest, signal?: AbortSignal): Promise<GeneratedArtifact[]>;
}

const sha = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex');
/** Deterministic pseudo-value in [0,1) from a seed + salt — NO Math.random (stable/replayable). */
const unit = (seed: string, salt: string): number => (parseInt(sha({ seed, salt }).slice(0, 8), 16) % 1_000_000) / 1_000_000;

/**
 * The default generator — DETERMINISTIC and NON-CLINICAL (Decision 1 / Decision 10). Given identical record identity +
 * provenance + config + generator version + kinds, it always produces identical content + content digests. It performs
 * NO image analysis and makes NO medical claim: heatmaps/overlays are opaque references; feature regions are coded
 * boxes/polygons in slide-pixel space; probability distributions are coded classes summing to 1. The "output" is a
 * deterministic structured artifact derived purely from the (already PHI-free) identity + digests.
 */
export class StubExplainabilityGenerator implements ExplainabilityGenerator {
  readonly generatorId = 'stub';
  readonly generatorVersion = '1.0.0';

  async generate(req: ExplainabilityGenerationRequest): Promise<GeneratedArtifact[]> {
    const base = { generatorId: this.generatorId, generatorVersion: this.generatorVersion, recordUuid: req.recordUuid, inputDigest: req.inputDigest, resultDigest: req.resultDigest, configDigest: req.configDigest };
    const w = req.slide?.width ?? null;
    const h = req.slide?.height ?? null;
    const boundW = w ?? 1000;
    const boundH = h ?? 1000;

    return req.kinds.map((kind): GeneratedArtifact => {
      const seed = sha({ ...base, kind });
      if (kind === 'FEATURE_REGION') {
        const regions: GeneratedRegion[] = [0, 1].map((i) => {
          const x = Math.floor(unit(seed, `x${i}`) * boundW * 0.5);
          const y = Math.floor(unit(seed, `y${i}`) * boundH * 0.5);
          const bw = Math.max(1, Math.floor(unit(seed, `w${i}`) * boundW * 0.25));
          const bh = Math.max(1, Math.floor(unit(seed, `h${i}`) * boundH * 0.25));
          return { regionType: 'BOUNDING_BOX' as ExplainabilityRegionType, categoryCode: `region-${i}`, geometry: { x, y, w: bw, h: bh }, weight: Number(unit(seed, `wt${i}`).toFixed(4)), ordinal: i };
        });
        return { kind, contentDigest: sha({ seed, regions }), contentRef: `stub://explain/feature-region/${seed.slice(0, 16)}`, regions };
      }
      if (kind === 'PROBABILITY_DISTRIBUTION') {
        const classes = ['class-a', 'class-b', 'class-c'];
        const raw = classes.map((c) => unit(seed, c) + 0.001); // strictly positive
        const total = raw.reduce((a, b) => a + b, 0);
        const probabilities: GeneratedProbability[] = classes.map((c, i) => ({ classCode: c, value: raw[i] / total, ordinal: i }));
        return { kind, contentDigest: sha({ seed, probabilities }), contentRef: null, probabilities };
      }
      // HEATMAP / ATTENTION_OVERLAY — an opaque reference to a raster (never stored/PHI); digest is the evidence.
      return { kind, contentDigest: seed, contentRef: `stub://explain/${kind.toLowerCase()}/${seed.slice(0, 16)}` };
    });
  }
}
