import { Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { getEnv } from '../config/env.config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

@Injectable()
export class CredentialsEncryptionService {
  private readonly logger = new Logger(CredentialsEncryptionService.name);
  private readonly key: Buffer | null;

  constructor() {
    const env = getEnv();
    if (env.CREDENTIALS_ENCRYPTION_KEY) {
      // Derive a 32-byte key from the configured secret using a SHA-256-like truncation
      const keyMaterial = Buffer.from(env.CREDENTIALS_ENCRYPTION_KEY, 'utf8');
      // Pad or truncate to exactly 32 bytes (256 bits)
      this.key = Buffer.alloc(32);
      keyMaterial.copy(this.key, 0, 0, Math.min(keyMaterial.length, 32));
    } else {
      this.key = null;
      this.logger.warn(
        'CREDENTIALS_ENCRYPTION_KEY not set — password encryption is disabled. ' +
          'Set savePassword=false or configure the key before saving passwords.',
      );
    }
  }

  /**
   * Encrypts a plaintext string using AES-256-GCM.
   * Returns a base64-encoded string: <iv>:<ciphertext>:<authTag>
   * Throws if encryption key is not configured.
   */
  encrypt(plaintext: string): string {
    if (!this.key) {
      throw new Error(
        'Cannot encrypt credentials: CREDENTIALS_ENCRYPTION_KEY is not set.',
      );
    }
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return [
      iv.toString('base64'),
      encrypted.toString('base64'),
      authTag.toString('base64'),
    ].join(':');
  }

  /**
   * Decrypts a previously-encrypted string.
   * Returns the original plaintext.
   * Throws if key is not configured or if the ciphertext is tampered.
   */
  decrypt(ciphertext: string): string {
    if (!this.key) {
      throw new Error(
        'Cannot decrypt credentials: CREDENTIALS_ENCRYPTION_KEY is not set.',
      );
    }
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted credential format.');
    }
    const [ivB64, encryptedB64, authTagB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const encrypted = Buffer.from(encryptedB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');

    const decipher = createDecipheriv(ALGORITHM, this.key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    try {
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);
      return decrypted.toString('utf8');
    } catch {
      throw new Error('Failed to decrypt credentials: authentication tag mismatch.');
    }
  }

  /** Returns true if the encryption key is configured and encryption is available. */
  isAvailable(): boolean {
    return this.key !== null;
  }
}
