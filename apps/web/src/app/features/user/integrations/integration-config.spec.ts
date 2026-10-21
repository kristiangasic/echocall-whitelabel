import { configPayload, rawConfig } from './integration-config';

describe('configPayload', () => {
  it('sends keys without a form field back as they came', () => {
    const loaded = rawConfig(
      JSON.stringify({ host: 'a.example', targets: [{ id: 1 }], limits: { calls: 3 }, retries: 2 }),
    );
    const typed = { host: 'b.example', targets: '[{"id":1}]', limits: '{"calls":3}', retries: '2' };

    expect(configPayload(loaded, typed, new Set(['host']))).toEqual({
      host: 'b.example',
      targets: [{ id: 1 }],
      limits: { calls: 3 },
      retries: 2,
    });
  });

  it('turns a shown field back into the type the service sent', () => {
    const loaded = rawConfig(JSON.stringify({ port: 587, secure: true, headers: { a: '1' }, note: 'x' }));
    const typed = { port: '2525', secure: 'false', headers: '{"a":"2"}', note: 'y' };

    expect(configPayload(loaded, typed, new Set(['port', 'secure', 'headers', 'note']))).toEqual({
      port: 2525,
      secure: false,
      headers: { a: '2' },
      note: 'y',
    });
  });

  it('keeps what was typed when it no longer reads as the old type', () => {
    const loaded = rawConfig(JSON.stringify({ port: 587, headers: { a: '1' } }));

    expect(configPayload(loaded, { port: 'abc', headers: 'not json' }, new Set(['port', 'headers']))).toEqual(
      {
        port: 'abc',
        headers: 'not json',
      },
    );
  });

  it('leaves out empty fields, masked values and the keys the service manages', () => {
    const loaded = rawConfig(
      JSON.stringify({
        apiKey: '********',
        token: '********',
        toolPermissions: { preset: 'read' },
        gone: null,
      }),
    );

    expect(configPayload(loaded, { apiKey: '', toolPermissions: '{}' }, new Set(['apiKey']))).toEqual({});
  });

  it('sends every typed field of a new connection as text', () => {
    expect(configPayload({}, { apiKey: 'k', eventTypeId: '12' }, new Set(['apiKey', 'eventTypeId']))).toEqual(
      {
        apiKey: 'k',
        eventTypeId: '12',
      },
    );
  });
});

describe('rawConfig', () => {
  it('reads nothing from a value that is not a JSON object', () => {
    expect(rawConfig(null)).toEqual({});
    expect(rawConfig('not json')).toEqual({});
    expect(rawConfig('[1,2]')).toEqual({});
  });
});
