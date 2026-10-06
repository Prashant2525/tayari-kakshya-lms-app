import { describe, expect, it } from 'vitest';
import { resolveAppReturnUrl, resolveCallbackBase } from './payments.service.js';

const dev = {
  APP_ENV: 'development' as const,
  PAYMENT_CALLBACK_BASE_URL: 'http://localhost:4000/',
  PAYMENT_RETURN_URL_APP: 'tayarikakshya://payment-result',
};
const prod = { ...dev, APP_ENV: 'production' as const, PAYMENT_CALLBACK_BASE_URL: 'https://api.example.com' };

describe('payment return addresses', () => {
  it('development: gateways send the device back to the address it reached the API on', () => {
    expect(resolveCallbackBase(dev, 'http://10.0.2.2:4000')).toBe('http://10.0.2.2:4000'); // Android emulator
    expect(resolveCallbackBase(dev, 'http://192.168.1.20:4000')).toBe('http://192.168.1.20:4000'); // phone on Wi-Fi
    expect(resolveCallbackBase(dev, null)).toBe('http://localhost:4000');
    expect(resolveCallbackBase(dev, 'http://evil.example/path?x')).toBe('http://localhost:4000');
  });

  it('elsewhere: always the configured public address, whatever the request says', () => {
    expect(resolveCallbackBase(prod, 'http://10.0.2.2:4000')).toBe('https://api.example.com');
    expect(resolveCallbackBase({ ...prod, APP_ENV: 'test' }, 'https://evil.example')).toBe(
      'https://api.example.com',
    );
  });

  it("returns to the app's link only when allowed (Expo Go in development), never an arbitrary address", () => {
    expect(resolveAppReturnUrl(dev, undefined)).toBe('tayarikakshya://payment-result');
    expect(resolveAppReturnUrl(dev, 'exp://192.168.1.20:8081/--/payment-result')).toBe(
      'exp://192.168.1.20:8081/--/payment-result',
    );
    expect(resolveAppReturnUrl(prod, 'exp://192.168.1.20:8081/--/payment-result')).toBe(
      'tayarikakshya://payment-result',
    );
    for (const bad of ['https://evil.example/payment-result', 'exp://x/--/other', 'javascript:alert(1)']) {
      expect(resolveAppReturnUrl(dev, bad)).toBe('tayarikakshya://payment-result');
    }
  });
});
