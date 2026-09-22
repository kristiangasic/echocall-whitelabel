import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthModule } from '../../auth/auth.module.js';
import { createResellerHubFake, type HubFakeCall, type HubFakeReply } from '../../testing/hub-fake.js';
import { createTestApp, type TestApp } from '../../testing/test-app.js';
import { type SignedInUser, signInAs } from '../../testing/users.js';
import { AdminInvoicesModule } from './admin-invoices.module.js';

const PDF = Buffer.from('%PDF-1.4 reseller invoice');

/** The service answers with a link unless the caller asks for the document. */
const INVOICE_ROUTE = (call: HubFakeCall): HubFakeReply =>
  call.headers.get('accept') === 'application/pdf'
    ? {
        binary: PDF,
        contentType: 'application/pdf',
        headers: { 'content-disposition': 'attachment; filename="R9-202609-0001.pdf"' },
      }
    : { body: { pdfUrl: '/invoices/R9-202609-0001.pdf' } };

const INCOMPLETE = {
  status: 409,
  body: {
    error: {
      code: 'company_details_incomplete',
      message: 'Company details are incomplete: companyCity, companyVatId',
      missing: ['companyCity', 'companyVatId'],
    },
  },
};

describe('AdminInvoicesController', () => {
  let t: TestApp;
  let admin: SignedInUser;
  let user: SignedInUser;

  beforeAll(async () => {
    const hub = createResellerHubFake({ 'GET /resellers/invoices/12/pdf': INVOICE_ROUTE });
    t = await createTestApp([AuthModule, AdminInvoicesModule], { hub });
    await t.db.reset();
    admin = await signInAs(t, { email: 'admin@example.com', role: 'admin' });
    user = await signInAs(t, { email: 'user@example.com', role: 'user', echocallCustomerId: 501 });
  });

  afterAll(async () => {
    await t.close();
  });

  const api = () => request(t.app.getHttpServer());

  it('is reserved for administrators', async () => {
    expect((await api().get('/api/admin/invoices/12/pdf')).status).toBe(401);
    expect((await api().get('/api/admin/invoices/12/pdf').set('Cookie', user.cookie)).status).toBe(403);
  });

  it('streams the document and keeps the service link out of the answer', async () => {
    const res = await api()
      .get('/api/admin/invoices/12/pdf')
      .set('Cookie', admin.cookie)
      .responseType('blob');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="R9-202609-0001.pdf"');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(Buffer.from(res.body)).toEqual(PDF);

    const call = t.hub.calls.findLast((c) => c.path === '/resellers/invoices/12/pdf');
    expect(call?.headers.get('accept')).toBe('application/pdf');
  });

  it('rejects an invoice id that is not a number', async () => {
    const res = await api().get('/api/admin/invoices/12x/pdf').set('Cookie', admin.cookie);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_id');
  });

  it('reports 502 when the service answers with a link instead of the document', async () => {
    t.hub.on('GET /resellers/invoices/12/pdf', { body: { pdfUrl: '/invoices/R9-202609-0001.pdf' } });
    try {
      const res = await api().get('/api/admin/invoices/12/pdf').set('Cookie', admin.cookie);
      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe('invoice_unavailable');
    } finally {
      t.hub.on('GET /resellers/invoices/12/pdf', INVOICE_ROUTE);
    }
  });

  // The operator has to be told which of their own details are missing, so the
  // refusal is passed on rather than turned into a generic failure.
  it('passes on the refusal while the company details are incomplete', async () => {
    t.hub.on('GET /resellers/invoices/12/pdf', INCOMPLETE);
    try {
      const res = await api().get('/api/admin/invoices/12/pdf').set('Cookie', admin.cookie);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('company_details_incomplete');
    } finally {
      t.hub.on('GET /resellers/invoices/12/pdf', INVOICE_ROUTE);
    }
  });

  // A filename is echoed into a response header, so anything the service could
  // have taken from user input is replaced rather than passed on.
  it('replaces a filename that is not a plain pdf name', async () => {
    t.hub.on('GET /resellers/invoices/12/pdf', {
      binary: PDF,
      contentType: 'application/pdf',
      headers: { 'content-disposition': 'attachment; filename="../../etc/passwd"' },
    });
    try {
      const res = await api()
        .get('/api/admin/invoices/12/pdf')
        .set('Cookie', admin.cookie)
        .responseType('blob');
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toBe('attachment; filename="invoice-12.pdf"');
    } finally {
      t.hub.on('GET /resellers/invoices/12/pdf', INVOICE_ROUTE);
    }
  });
});
