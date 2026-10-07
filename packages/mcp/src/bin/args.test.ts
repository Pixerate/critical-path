import { describe, it, expect } from 'vitest';
import { parseArgs, buildApiHeaders, isInsecureRemote } from './args.js';

describe('MCP CLI arguments', () => {
  it('collects repeated --header flags', () => {
    const options = parseArgs(['--api', 'https://x.test/api', '--header', 'X-Tenant: acme', '--header', 'X-Trace: 1']);
    expect(options.api).toBe('https://x.test/api');
    expect(options.headers).toEqual(['X-Tenant: acme', 'X-Trace: 1']);
  });

  it('builds headers from the token env var and flags, with flags taking precedence', () => {
    expect(buildApiHeaders(['X-Tenant: acme'], { CRITICAL_PATH_API_TOKEN: 'secret' })).toEqual({
      Authorization: 'Bearer secret',
      'X-Tenant': 'acme'
    });
    expect(buildApiHeaders(['Authorization: Basic abc'], { CRITICAL_PATH_API_TOKEN: 'secret' }).Authorization).toBe(
      'Basic abc'
    );
    expect(() => buildApiHeaders(['no-colon'], {})).toThrow(/Expected "Name: value"/);
  });

  it('flags plain http to remote hosts only', () => {
    expect(isInsecureRemote('http://api.example.com')).toBe(true);
    expect(isInsecureRemote('https://api.example.com')).toBe(false);
    expect(isInsecureRemote('http://localhost:3000/api')).toBe(false);
    expect(isInsecureRemote('http://127.0.0.1:3000')).toBe(false);
  });
});
