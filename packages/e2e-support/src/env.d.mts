export declare const E2E_ADMIN_EMAIL: string;
export declare const E2E_ADMIN_PASSWORD: string;
export declare const E2E_EDITOR_EMAIL: string;
export declare const E2E_EDITOR2_EMAIL: string;
export declare const E2E_EDITOR3_EMAIL: string;
export declare const E2E_STUDENT_EMAIL: string;
export declare const apiDir: string;
export declare function createE2eEnv(options: {
  name?: string;
  apiPort: number;
  webOrigin: string;
  apiOrigin?: string;
  redisDb: number;
  email?: 'log' | 'smtp';
}): NodeJS.ProcessEnv;
