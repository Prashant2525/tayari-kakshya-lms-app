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
    const [maintenance, minVersions, purchaseChannels, verification, questionTypes] = await Promise.all([
      this.settings.get('app.maintenance'),
      this.settings.get('app.minVersions'),
      this.settings.get('purchase.channels'),
      this.settings.get('auth.verification'),
      this.settings.get('questions.types'),
    ]);
    return {
      maintenance,
      minVersions,
      purchaseChannels,
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
