import { createDb } from '../db/dialect.js';
import { inviteLink, signInLink } from '../auth/links.js';
import { SIGN_IN_LINK_TTL_MS, TokenService } from '../auth/token.service.js';
import { loadEnv } from '../config/env.js';

/**
 * Prints a way into the portal for one account, on the machine the portal runs
 * on. Everything else about signing in goes through the mail server, so this is
 * what is left when that server is the thing that is broken: whoever can reach
 * the container can let themselves back in.
 *
 *   docker compose exec app node dist/cli/sign-in-link.js you@example.com
 *
 * The link it prints is the same one the mail would have carried, and it is
 * spent the moment it is used.
 */
async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error('Usage: node dist/cli/sign-in-link.js <email>');
    process.exitCode = 2;
    return;
  }
  try {
    process.loadEnvFile('.env');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const config = loadEnv(process.env);
  const { db } = createDb(config.database.url, config.database.ssl);
  try {
    const user = await db
      .selectFrom('users')
      .select(['id', 'email', 'status'])
      .where('email', '=', email)
      .executeTakeFirst();
    if (!user) {
      console.error(`No account here has the address ${email}`);
      process.exitCode = 1;
      return;
    }
    if (user.status === 'disabled') {
      console.error(`The account ${user.email} is disabled; enable it first`);
      process.exitCode = 1;
      return;
    }
    const tokens = new TokenService(db);
    // An account that never accepted its invitation has no sign-in yet, so what
    // it needs is that invitation again, not a link past it.
    if (user.status === 'invited') {
      const token = await tokens.issue(user.id, 'invite', SIGN_IN_LINK_TTL_MS);
      console.log(`Invitation for ${user.email}, valid for 15 minutes and usable once:`);
      console.log(inviteLink(config.appUrl, token));
      return;
    }
    const token = await tokens.issue(user.id, 'sign_in', SIGN_IN_LINK_TTL_MS);
    console.log(`Sign-in link for ${user.email}, valid for 15 minutes and usable once:`);
    console.log(signInLink(config.appUrl, token));
  } finally {
    await db.destroy();
  }
}

await main();
