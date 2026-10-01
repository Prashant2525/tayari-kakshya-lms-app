import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

/** Argon2id with OWASP-recommended parameters (19 MiB, t=2, p=1). */
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class PasswordService {
  /** Hash of a random value, verified when the user does not exist so response timing does not reveal accounts. */
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return argon2.hash(password, OPTIONS);
  }

  async verify(hash: string | null | undefined, password: string): Promise<boolean> {
    if (!hash) {
      this.dummyHash ??= argon2.hash('dummy-password-for-timing', OPTIONS);
      await argon2.verify(await this.dummyHash, password).catch(() => false);
      return false;
    }
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
}
