import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/auth-context.js';
import { SettingsService } from './settings.service.js';

/** Public bootstrap configuration for the apps and website (no secrets, no prices). */
@ApiTags('app')
@Controller('app')
export class AppConfigController {
  constructor(private readonly settings: SettingsService) {}

  @Public()
  @Get('config')
  async config() {
    const [
      maintenance,
      minVersions,
      storeLinks,
      purchaseChannels,
      verification,
      questionTypes,
      referrals,
      offline,
    ] = await Promise.all([
      this.settings.get('app.maintenance'),
      this.settings.get('app.minVersions'),
      this.settings.get('app.storeLinks'),
      this.settings.get('purchase.channels'),
      this.settings.get('auth.verification'),
      this.settings.get('questions.types'),
      this.settings.get('referrals.rules'),
      this.settings.get('offline.rules'),
    ]);
    return {
      maintenance,
      minVersions,
      storeLinks,
      purchaseChannels,
      /** D-059: whether sign-up forms show the referral code field. */
      referrals: { enabled: referrals.enabled },
      /** D-067: whether lessons can be downloaded, and for how many days they open without internet. */
      offline,
      verification: {
        channels: verification.channels,
        requiredForLearning: verification.requiredForLearning,
      },
      /** Display names the CMS set for question types (apps fall back to their own wording). */
      questionTypeLabels: questionTypes.labels,
      enabledQuestionTypes: questionTypes.enabled,
    };
  }
}
