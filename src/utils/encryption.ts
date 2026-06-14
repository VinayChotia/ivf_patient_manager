// src/utils/encryption.ts
import crypto from 'crypto';

/**
 * Encryption utility using AES-256-GCM
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 16 bytes for GCM
const AUTH_TAG_LENGTH = 16; // 16 bytes for auth tag

export class EncryptionService {
  private key: Buffer;

  constructor(encryptionKey: string) {
    // Key should be 64 hex characters (32 bytes)
    if (encryptionKey.length !== 64) {
      throw new Error('Encryption key must be 64 hex characters (32 bytes)');
    }
    this.key = Buffer.from(encryptionKey, 'hex');
  }

  /**
   * Encrypt a string and return base64 encoded result
   */
  encrypt(data: string): string {
    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
      
      const encrypted = Buffer.concat([
        cipher.update(data, 'utf8'),
        cipher.final()
      ]);
      
      const authTag = cipher.getAuthTag();
      
      // Combine IV + authTag + encrypted data
      const combined = Buffer.concat([iv, authTag, encrypted]);
      
      return combined.toString('base64');
    } catch (error) {
      throw new Error(`Encryption failed: ${(error as Error).message}`);
    }
  }

  /**
   * Decrypt a base64 encoded string
   */
  decrypt(encryptedData: string): string {
    try {
      const combined = Buffer.from(encryptedData, 'base64');
      
      // Extract IV, authTag, and encrypted data
      const iv = combined.slice(0, IV_LENGTH);
      const authTag = combined.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
      const encrypted = combined.slice(IV_LENGTH + AUTH_TAG_LENGTH);
      
      const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(authTag);
      
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);
      
      return decrypted.toString('utf8');
    } catch (error) {
      throw new Error(`Decryption failed: ${(error as Error).message}`);
    }
  }
}

// Initialize globally
let encryptionService: EncryptionService;

export function initializeEncryption(key: string): void {
  encryptionService = new EncryptionService(key);
}

export function getEncryption(): EncryptionService {
  if (!encryptionService) {
    throw new Error('Encryption service not initialized');
  }
  return encryptionService;
}
