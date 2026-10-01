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
    const [maintenance, minVersions, purchaseChannels, verification] = await Promise.all([
      this.settings.get('app.maintenance'),
      this.settings.get('app.minVersions'),
      this.settings.get('purchase.channels'),
      this.settings.get('auth.verification'),
    ]);
    return {
      maintenance,
      minVersions,
      purchaseChannels,
      verification: {
        channels: verification.channels,
        requiredForLearning: verification.requiredForLearning,
      },
    };
  }
}
