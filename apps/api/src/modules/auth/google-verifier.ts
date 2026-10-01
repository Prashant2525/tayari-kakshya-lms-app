import { Inject, Injectable } from '@nestjs/common';
import { ErrorCode } from '@tk/contracts';
import { OAuth2Client } from 'google-auth-library';
import { AppError } from '../../common/errors/app-error.js';
import { ENV, type Env } from '../../config/env.js';

export interface GoogleIdentity {
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

/** Verifies Google ID tokens server-side (audience = our OAuth client IDs). Swappable in tests. */
export abstract class GoogleVerifier {
  abstract verify(idToken: string): Promise<GoogleIdentity>;
}

@Injectable()
export class GoogleAuthLibraryVerifier extends GoogleVerifier {
  private readonly client = new OAuth2Client();
  private readonly audiences: string[];

  constructor(@Inject(ENV) env: Env) {
    super();
    this.audiences = [
      env.GOOGLE_OAUTH_WEB_CLIENT_ID,
      env.GOOGLE_OAUTH_ANDROID_CLIENT_ID,
      env.GOOGLE_OAUTH_IOS_CLIENT_ID,
    ].filter((v): v is string => Boolean(v));
  }

  async verify(idToken: string): Promise<GoogleIdentity> {
    if (this.audiences.length === 0) {
      throw new AppError(503, ErrorCode.GOOGLE_NOT_CONFIGURED, 'Google sign-in is not configured');
    }
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience: this.audiences });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email) throw new Error('missing claims');
      return {
        subject: payload.sub,
        email: payload.email.toLowerCase(),
        emailVerified: payload.email_verified === true,
        name: payload.name ?? null,
      };
    } catch {
      throw new AppError(401, ErrorCode.GOOGLE_TOKEN_INVALID, 'Google sign-in could not be verified');
    }
  }
}
