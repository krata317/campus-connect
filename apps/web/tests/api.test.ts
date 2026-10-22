import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, errorMessage } from '@/lib/api';

const jsonResponse = (body: unknown, status = 200): Response =>
  ({
    status,
    ok: status >= 200 && status < 300,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  }) as unknown as Response;

describe('api client', () => {
  beforeEach(() => {
    document.cookie = 'cc.csrf=test-csrf-token';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the CSRF token on mutating requests but not on GET', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await api.get('/students/me/profile');
    const getHeaders = (fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }])[1].headers;
    expect(getHeaders['X-CSRF-Token']).toBeUndefined();

    await api.post('/auth/login', { email: 'a@b.com' });
    const postCall = fetchMock.mock.calls[1] as unknown as [string, { headers: Record<string, string>; method: string }];
    expect(postCall[1].headers['X-CSRF-Token']).toBe('test-csrf-token');
    expect(postCall[1].method).toBe('POST');
  });

  it('treats a 204 as an empty success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(undefined, 204)));

    await expect(api.delete('/auth/logout')).resolves.toBeUndefined();
  });

  it('turns a field level validation error into a readable field map', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Some fields need your attention',
              details: { fields: [{ path: 'email', message: 'Enter a valid email address' }] },
            },
          },
          400,
        ),
      ),
    );

    const error = await api.post('/auth/register/student', {}).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(400);
    expect(apiError.code).toBe('VALIDATION_ERROR');
    expect(apiError.fieldError('email')).toBe('Enter a valid email address');
    expect(apiError.fieldErrors).toHaveLength(1);
  });

  it('explains a network failure instead of leaking a low level error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    const error = (await api.get('/auth/me').catch((caught: unknown) => caught)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.message).toContain('port 4000');
  });

  it('surfaces the server message for a conflict', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: { code: 'CONFLICT', message: 'An account with this email address already exists.' } }, 409)),
    );

    const error = (await api.post('/auth/register/student', {}).catch((caught: unknown) => caught)) as ApiError;

    expect(error.status).toBe(409);
    expect(errorMessage(error)).toBe('An account with this email address already exists.');
  });
});
