/** DI token for the pluggable explainability generator (Decision 13 — the service never names a provider). */
export const EXPLAINABILITY_GENERATOR = Symbol('EXPLAINABILITY_GENERATOR');

/**
 * Explainability engine version — recorded on every generation so an artifact set is reproducible from audit even as
 * the engine evolves. Bump on any change to the generation/atomicity contract. (Generator id/version are separate,
 * carried by the adapter, so a generator swap is independently traceable.)
 */
export const EXPLAINABILITY_ENGINE_VERSION = '6d.1.0';

/** Σ of a probability distribution must equal 1.0 within this tolerance (Decision 6 — a testable data invariant). */
export const PROBABILITY_SUM_TOLERANCE = 1e-6;
