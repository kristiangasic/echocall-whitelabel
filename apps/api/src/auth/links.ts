/**
 * Where the links the portal hands out point. One place, because a mailed link,
 * a link an administrator passes on and the one the console prints all have to
 * open the same page.
 */
export function signInLink(appUrl: string, token: string): string {
  return `${appUrl}/sign-in?token=${encodeURIComponent(token)}`;
}

export function inviteLink(appUrl: string, token: string): string {
  return `${appUrl}/accept-invite?token=${encodeURIComponent(token)}`;
}
