import type { RedactedPayload } from './redaction';

export type AiDraftKind = 'Narrative' | 'CodeSuggestion' | 'ConsistencyCheck';

// Bump the version when a prompt changes; every AiDraft records the version used
// (provenance / reproducibility).
export const PROMPT_VERSIONS: Record<AiDraftKind, string> = {
  Narrative: 'narrative-v1',
  CodeSuggestion: 'codes-v1',
  ConsistencyCheck: 'consistency-v1',
};

const BASE_SYSTEM = [
  'You are an assistive drafting aide for a cytology/pathology laboratory information system.',
  'You DRAFT text for a human Authorizer (Pathologist/Cytologist) to review and edit.',
  'You do NOT diagnose, you do NOT authorize, and nothing you produce is final.',
  'Use ONLY the structured data provided. Never invent findings, values, or history.',
  'If the data is insufficient or ambiguous, say so plainly and flag the uncertainty.',
  'The data is de-identified; do not ask for or infer patient identity.',
].join(' ');

export interface BuiltPrompt {
  system: string;
  user: string;
  promptVersion: string;
}

/** Assemble the system + user messages for a capability from the redacted payload. */
export function buildPrompt(kind: AiDraftKind, payload: RedactedPayload, houseStyle?: string | null): BuiltPrompt {
  const system = houseStyle ? `${BASE_SYSTEM}\n\nLab house style to follow:\n${houseStyle}` : BASE_SYSTEM;
  const data = JSON.stringify(payload, null, 2);

  let user: string;
  switch (kind) {
    case 'Narrative':
      user = [
        'Draft a report narrative for this case in the house style.',
        'Return the narrative prose ONLY — no headings, preamble, or commentary.',
        '',
        'Case data:',
        data,
      ].join('\n');
      break;
    case 'CodeSuggestion':
      user = [
        'From the observations below, suggest likely code-sheet codes the authorizer may not have entered.',
        'Return ONLY a JSON array: [{ "abbreviation": string, "rationale": string, "confidence": "low"|"medium"|"high" }].',
        'Suggest nothing if the data does not support it (return []).',
        '',
        'Case data:',
        data,
      ].join('\n');
      break;
    case 'ConsistencyCheck':
      user = [
        'Compare the coded findings with the narrative and flag contradictions or omissions.',
        'Return ONLY JSON: { "flags": [{ "severity": "info"|"warning", "message": string }] }.',
        'Return an empty flags array if the narrative and coded findings are consistent.',
        '',
        'Case data (includes narrative):',
        data,
      ].join('\n');
      break;
  }

  return { system, user, promptVersion: PROMPT_VERSIONS[kind] };
}
