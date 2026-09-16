import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../db/test-db.js';
import { testConfig } from '../testing/test-app.js';
import { DEFAULT_BRANDING } from './branding.js';
import { SettingsService } from './settings.service.js';

describe('SettingsService', () => {
  let t: TestDb;
  let settings: SettingsService;

  beforeAll(async () => {
    t = await createTestDb();
    settings = new SettingsService(t.db, t.dialect, testConfig());
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await t.reset();
  });

  it('returns the defaults until branding is stored, then the stored values on top of them', async () => {
    expect(await settings.getBranding()).toEqual(DEFAULT_BRANDING);
    await settings.setBranding({ ...DEFAULT_BRANDING, productName: 'Acme Portal', primaryColor: '#ff0000' });
    expect(await settings.getBranding()).toMatchObject({
      productName: 'Acme Portal',
      primaryColor: '#ff0000',
    });
    await settings.setBranding({ ...DEFAULT_BRANDING, productName: 'Acme Portal 2' });
    expect(await settings.getBranding()).toMatchObject({
      productName: 'Acme Portal 2',
      primaryColor: '#2563eb',
    });
    expect(await t.db.selectFrom('settings').select('key').execute()).toEqual([{ key: 'branding' }]);
  });

  it('stores the SMTP password encrypted and gives it back decrypted', async () => {
    expect(await settings.getSmtp()).toBeNull();
    await settings.setSmtp({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      user: 'mailer',
      pass: 'hunter2-secret',
      from: 'portal@example.com',
    });
    const raw = await t.db
      .selectFrom('settings')
      .select('value')
      .where('key', '=', 'smtp')
      .executeTakeFirstOrThrow();
    expect(raw.value).not.toContain('hunter2-secret');
    expect(raw.value).toContain('"passEncrypted":"v1:');
    expect(await settings.getSmtp()).toEqual({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      user: 'mailer',
      pass: 'hunter2-secret',
      from: 'portal@example.com',
    });
  });

  it('removes the SMTP settings and reports a lost password instead of failing', async () => {
    await settings.setSmtp({ host: 'h', port: 25, secure: false, user: null, pass: 'p', from: 'a@b.co' });
    const other = new SettingsService(t.db, t.dialect, testConfig({ APP_SECRET: 'x'.repeat(32) }));
    expect((await other.getSmtp())?.pass).toBeNull();
    await settings.setSmtp(null);
    expect(await settings.getSmtp()).toBeNull();
  });
});
