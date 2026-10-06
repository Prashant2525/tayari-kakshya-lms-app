// Student app browser E2E: its own API, database (<base>_mobile_e2e) and Redis DB, so it can run beside the admin suite.
import { createE2eEnv } from '@tk/e2e-support/env';
import { E2E_API_PORT, E2E_WEB_ORIGIN } from './constants.mjs';

/** Test values: the referral programme on (D-058), so the suite can exercise it. */
const REFERRALS = {
  enabled: true,
  friendDiscount: {
    type: 'percent',
    percentBps: 1000,
    amountPaisa: null,
    maxDiscountPaisa: null,
    allowOnSale: false,
  },
  reward: {
    type: 'fixed',
    percentBps: null,
    amountPaisa: 10000,
    maxDiscountPaisa: null,
    validDays: 30,
    allowOnSale: false,
  },
};

const base = createE2eEnv({
  name: 'mobile',
  apiPort: E2E_API_PORT,
  webOrigin: E2E_WEB_ORIGIN,
  redisDb: 13,
  email: 'smtp',
});

export const e2eEnv = { ...base, E2E_SETTINGS: JSON.stringify({ 'referrals.rules': REFERRALS }) };
