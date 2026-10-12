import { describe, it, expect } from 'vitest';

import { messageForApiError } from './api';
import { responseError, tooManyAttempts } from './authFetch';

/* A rate-limited reply (429) has no `detail`, so pages fell through to their
 * own fallback: the candidate sign-in said the code was wrong. They now say to
 * wait, for as long as the server's limit says. */

const limited = error => ({ status: 429, json: async () => ({ error }) });

describe('a rate-limited reply', () => {
  it('says to wait a minute when the limit is per minute', async () => {
    expect(await responseError(limited('Rate limit exceeded: 5 per 1 minute'), 'Wrong code'))
      .toBe('Too many attempts. Please wait a minute and try again.');
  });

  it('or an hour, when it is per hour', async () => {
    expect(await responseError(limited('Rate limit exceeded: 3 per 1 hour'), 'Wrong code'))
      .toBe('Too many attempts. Please wait an hour and try again.');
  });

  it('or a while, when the reply does not say', async () => {
    const notJson = { status: 429, json: async () => { throw new Error('not JSON'); } };
    expect(await responseError(notJson, 'Wrong code')).toBe('Too many attempts. Please wait a while and try again.');
    expect(tooManyAttempts(undefined)).toBe('Too many attempts. Please wait a while and try again.');
  });

  it('reads the same through axios', () => {
    const err = { response: { status: 429, data: { error: 'Rate limit exceeded: 5 per 1 minute' } } };
    expect(messageForApiError(err, 'Invalid email or password'))
      .toBe('Too many attempts. Please wait a minute and try again.');
  });

  it('leaves any other failure its own message', async () => {
    expect(await responseError({ status: 400, json: async () => ({ detail: 'That code is wrong' }) }, 'Wrong code'))
      .toBe('That code is wrong');
  });
});
