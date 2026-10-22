import request from 'supertest';
import type { Response, Test } from 'supertest';
import { createApp } from '../../src/app';

/**
 * A cookie-aware HTTP client that also carries the double-submit CSRF token,
 * so integration tests exercise the same security path a browser does.
 */
export interface TestClient {
  /** Fetch a CSRF token and keep it for subsequent mutating calls. */
  prime: () => Promise<string>;
  get: (url: string) => Promise<Response>;
  post: (url: string, body?: unknown) => Promise<Response>;
  put: (url: string, body?: unknown) => Promise<Response>;
  patch: (url: string, body?: unknown) => Promise<Response>;
  del: (url: string) => Promise<Response>;
  /** Send a mutating request with no CSRF header, to assert the guard fires. */
  postWithoutCsrf: (url: string, body?: unknown) => Promise<Response>;
  /** Send a mutating request with a wrong CSRF header. */
  postWithBadCsrf: (url: string, body?: unknown) => Promise<Response>;
}

const app = createApp();

export const createTestClient = (): TestClient => {
  const agent = request.agent(app);
  let token: string | null = null;

  const prime = async (): Promise<string> => {
    if (token) return token;
    const response = await agent.get('/api/auth/csrf');
    token = (response.body as { csrfToken: string }).csrfToken;
    return token;
  };

  const mutate = async (method: 'post' | 'put' | 'patch' | 'delete', url: string, body?: unknown): Promise<Response> => {
    const csrf = await prime();
    let pending: Test = agent[method](url).set('X-CSRF-Token', csrf);
    if (body !== undefined) pending = pending.send(body as object);
    return pending;
  };

  return {
    prime,
    get: (url) => agent.get(url),
    post: (url, body) => mutate('post', url, body),
    put: (url, body) => mutate('put', url, body),
    patch: (url, body) => mutate('patch', url, body),
    del: (url) => mutate('delete', url),
    postWithoutCsrf: (url, body) => {
      let pending: Test = agent.post(url);
      if (body !== undefined) pending = pending.send(body as object);
      return pending;
    },
    postWithBadCsrf: (url, body) => {
      let pending: Test = agent.post(url).set('X-CSRF-Token', 'x'.repeat(64));
      if (body !== undefined) pending = pending.send(body as object);
      return pending;
    },
  };
};

/** Unique email per test run so leftovers can never collide with fixtures. */
export const uniqueEmail = (prefix: string): string =>
  `${prefix}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}@campusconnect.test`;

export const STUDENT_PASSWORD = 'StudentPass123';
export const EMPLOYER_PASSWORD = 'EmployerPass123';
export const ADMIN_PASSWORD = 'AdminPass123';
