import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { decrypt, encrypt, getEncryptionKey, isEncrypted } from './crypto/phi-crypto';

/**
 * Injectable façade over the PHI encryption primitives ({@link phi-crypto}).
 *
 * AES-256-GCM via Node's built-in `crypto`. Used for encrypting the TOTP secret
 * and any ad-hoc PHI a service needs to handle directly; transparent field
 * encryption on Patient rows is handled by the Prisma extension, which calls the
 * same primitives.
 */
@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly logger = new Logger(EncryptionService.name);

  /** Fail hard at boot if ENCRYPTION_KEY is missing/malformed. */
  onModuleInit(): void {
    getEncryptionKey();
    this.logger.log('PHI encryption key loaded (AES-256-GCM).');
  }

  encrypt(plaintext: string): string {
    return encrypt(plaintext);
  }

  decrypt(encrypted: string): string {
    return decrypt(encrypted);
  }

  isEncrypted(value: unknown): boolean {
    return isEncrypted(value);
  }
}
