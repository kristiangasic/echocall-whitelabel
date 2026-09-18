import { SessionService } from '../auth/session.service.js';
import type { NewUser } from '../db/database.types.js';
import { insertReturningId } from '../db/helpers.js';
import type { TestApp } from './test-app.js';

export interface TestUserInput extends Partial<NewUser> {
  email: string;
  role: 'admin' | 'user';
}

export interface SignedInUser {
  id: number;
  email: string;
  /** Value for the Cookie request header. */
  cookie: string;
}

export function createUser(t: TestApp, user: TestUserInput): Promise<number> {
  return insertReturningId(t.db.db, t.db.dialect, 'users', {
    status: 'active',
    // An account a spec asks for is one whose invitation was accepted long ago.
    acceptedAt: new Date(),
    language: 'en',
    echocallCustomerId: user.role === 'user' ? 501 : null,
    ...user,
  });
}

/** Creates an active account and a session for it, returning the cookie header value. */
export async function signInAs(t: TestApp, user: TestUserInput): Promise<SignedInUser> {
  const id = await createUser(t, user);
  const sessions = t.moduleRef.get(SessionService, { strict: false });
  const { token } = await sessions.create(id);
  return { id, email: user.email, cookie: `ecl_session=${token}` };
}
