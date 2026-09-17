import { parseRecipients } from './campaign-recipients';

describe('parseRecipients', () => {
  it('reads one number per line', () => {
    expect(parseRecipients('+4930111\n+4930222')).toEqual([
      { phoneNumber: '+4930111' },
      { phoneNumber: '+4930222' },
    ]);
  });

  it('keeps the name behind the separator', () => {
    expect(parseRecipients('+4930111, Maria Beispiel')).toEqual([
      { phoneNumber: '+4930111', name: 'Maria Beispiel' },
    ]);
  });

  it('accepts what spreadsheets export', () => {
    expect(parseRecipients('+4930111;Maria\n+4930222\tJan')).toEqual([
      { phoneNumber: '+4930111', name: 'Maria' },
      { phoneNumber: '+4930222', name: 'Jan' },
    ]);
  });

  it('drops empty lines and lines without a number', () => {
    expect(parseRecipients('+4930111\n\n   \n, Ohne Nummer\n')).toEqual([{ phoneNumber: '+4930111' }]);
  });

  it('survives the line endings a Windows editor writes', () => {
    expect(parseRecipients('+4930111\r\n+4930222')).toEqual([
      { phoneNumber: '+4930111' },
      { phoneNumber: '+4930222' },
    ]);
  });
});
