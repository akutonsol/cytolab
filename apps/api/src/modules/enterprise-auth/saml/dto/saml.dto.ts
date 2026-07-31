import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Program 7 · Phase 7A.3 — the ACS POST body (HTTP-POST binding). `SAMLResponse` is the base64 response; `RelayState`
 * is the Osieri-issued single-use correlation token (§3a) — it is validated against the persisted request and is NEVER
 * treated as a redirect target. Both are length-bounded to fail closed on oversized input.
 */
export class SamlAcsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1_000_000) // a bounded SAML response; oversized input is rejected before processing
  SAMLResponse!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512) // RelayState is a short correlation token; oversized values are rejected (§3a)
  RelayState?: string;
}
