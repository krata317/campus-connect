import request from 'supertest';
import type { Response as SupertestResponse } from 'supertest';
import { createApp } from '../../src/app';

export const STUDENT_PASSWORD = 'StudentPass2026';
export const RECRUITER_PASSWORD = 'RecruiterPass2026';
export const ADMIN_PASSWORD = 'InstituteAdminPass2026';

const app = createApp();

let counter = 0;

export const uniqueEmail = (prefix: string): string => {
  counter += 1;
  return `${prefix}.${Date.now().toString(36)}.${counter}@example.test`;
};

export const uniqueCompany = (base = 'Northwind Systems'): string => `${base} ${Date.now().toString(36)}${counter}`;

export interface TestClient {
  get: (path: string) => Promise<SupertestResponse>;
  post: (path: string, body?: unknown) => Promise<SupertestResponse>;
  put: (path: string, body?: unknown) => Promise<SupertestResponse>;
  patch: (path: string, body?: unknown) => Promise<SupertestResponse>;
  delete: (path: string) => Promise<SupertestResponse>;
  postWithoutCsrf: (path: string, body?: unknown) => Promise<SupertestResponse>;
  postWithBadCsrf: (path: string, body?: unknown) => Promise<SupertestResponse>;
  prime: () => Promise<void>;
}

/**
 * A cookie-aware client. It mirrors the browser: fetch the CSRF cookie first,
 * then echo it in the header on every mutating request.
 */
export const createTestClient = (): TestClient => {
  const agent = request.agent(app);
  let csrfToken = '';

  const prime = async (): Promise<void> => {
    const response = await agent.get('/api/auth/csrf');
    csrfToken = (response.body as { csrfToken?: string }).csrfToken ?? '';
  };

  const ensureCsrf = async (): Promise<string> => {
    if (!csrfToken) await prime();
    return csrfToken;
  };

  const send = async (method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, body?: unknown, token = '') => {
    const req = method === 'get' || method === 'delete' ? agent[method](path) : agent[method](path).send(body as object);
    return token ? req.set('X-CSRF-Token', token) : req;
  };

  return {
    prime,
    get: (path) => send('get', path),
    post: async (path, body) => send('post', path, body, await ensureCsrf()),
    put: async (path, body) => send('put', path, body, await ensureCsrf()),
    patch: async (path, body) => send('patch', path, body, await ensureCsrf()),
    delete: async (path) => send('delete', path, undefined, await ensureCsrf()),
    postWithoutCsrf: (path, body) => send('post', path, body),
    postWithBadCsrf: async (path, body) => {
      await ensureCsrf();
      return send('post', path, body, 'deadbeef'.repeat(8));
    },
  };
};

export { app };
