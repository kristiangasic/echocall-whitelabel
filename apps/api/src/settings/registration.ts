import { z } from 'zod';

/**
 * Who may open an account, and how people prove who they are. Both are off in a
 * fresh portal and after an update, so no portal starts taking sign-ups or
 * changes how its people sign in because it was upgraded.
 */
export interface RegistrationSettings {
  /** Anyone can open an account from the sign-in page, without an operator inviting them. */
  selfServiceEnabled: boolean;
  /**
   * A one-time link by mail as a way in, next to the password. An account that
   * never chose a password can only come in this way, which is the point: a
   * self-service sign-up with links on is finished in one click.
   */
  signInLinksEnabled: boolean;
}

export const DEFAULT_REGISTRATION: RegistrationSettings = {
  selfServiceEnabled: false,
  signInLinksEnabled: false,
};

export const registrationSchema = z.object({
  selfServiceEnabled: z.boolean(),
  signInLinksEnabled: z.boolean(),
});

export type RegistrationInput = z.input<typeof registrationSchema>;

/**
 * What the sign-in page is told before anyone has signed in. It is the same two
 * flags: which ways in exist is visible from the page anyway, and hiding them
 * would only mean the page cannot draw itself.
 */
export type PublicRegistration = RegistrationSettings;
