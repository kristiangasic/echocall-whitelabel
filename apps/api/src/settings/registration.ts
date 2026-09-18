import { z } from 'zod';

/**
 * Who may open an account. It is off in a fresh portal and after an update, so
 * no portal starts taking sign-ups because it was upgraded.
 */
export interface RegistrationSettings {
  /** Anyone can open an account from the sign-in page, without an operator inviting them. */
  selfServiceEnabled: boolean;
}

export const DEFAULT_REGISTRATION: RegistrationSettings = { selfServiceEnabled: false };

export const registrationSchema = z.object({ selfServiceEnabled: z.boolean() });

export type RegistrationInput = z.input<typeof registrationSchema>;

/**
 * What the sign-in page is told before anyone has signed in. It is the same
 * flag: whether the page offers a sign-up form is visible from the page anyway,
 * and hiding it would only mean the page cannot draw itself.
 */
export type PublicRegistration = RegistrationSettings;
