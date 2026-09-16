import { HttpErrorResponse } from '@angular/common/http';
import { fieldErrors, readApiError } from './api-error';

describe('readApiError', () => {
  it('reads the code and details from the API envelope', () => {
    const error = new HttpErrorResponse({
      status: 400,
      error: {
        error: {
          code: 'validation_error',
          message: 'The request is invalid',
          details: [{ path: 'email', message: 'Invalid email' }],
        },
      },
    });
    const read = readApiError(error);
    expect(read).toMatchObject({ status: 400, code: 'validation_error', message: 'The request is invalid' });
    expect(fieldErrors(read)).toEqual({ email: 'Invalid email' });
  });

  it('reports network failures and responses without an envelope', () => {
    expect(readApiError(new HttpErrorResponse({ status: 0 })).code).toBe('network');
    expect(readApiError(new HttpErrorResponse({ status: 502, error: '<html>' })).code).toBe('unknown');
    expect(readApiError(new Error('boom'))).toEqual({ status: 0, code: 'unknown', message: 'boom' });
    expect(fieldErrors(readApiError(new Error('boom')))).toEqual({});
  });
});
