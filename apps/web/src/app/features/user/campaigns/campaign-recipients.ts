/** One person a campaign calls. */
export interface ParsedRecipient {
  phoneNumber: string;
  name?: string;
}

/**
 * Reads the recipient list a customer pasted into the text area. One recipient
 * per line, either just the number or "number, name". Separators may be commas,
 * semicolons or tabs, because that is what spreadsheets export. Empty lines and
 * lines without a number are dropped rather than sent to the hub.
 */
export function parseRecipients(raw: string): ParsedRecipient[] {
  const recipients: ParsedRecipient[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const [rawNumber, ...rest] = line.split(/[,;\t]/);
    const phoneNumber = (rawNumber ?? '').trim();
    if (!phoneNumber) continue;
    const name = rest.join(' ').trim();
    recipients.push(name ? { phoneNumber, name } : { phoneNumber });
  }
  return recipients;
}
