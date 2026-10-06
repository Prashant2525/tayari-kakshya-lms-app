import type { Server } from 'node:http';
export declare const E2E_ESEWA_SECRET: string;
export declare const E2E_KHALTI_KEY: string;
export declare function startFakeGateway(port: number): Server;
export declare function fakeGatewayEnv(
  port: number,
  urls: { callbackBase: string; webReturnUrl: string },
): Record<string, string>;
