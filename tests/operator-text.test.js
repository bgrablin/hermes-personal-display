import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';

const window = {};
vm.runInNewContext(readFileSync('src/mascot/sanitize.js', 'utf8'), { window });
const clean = window.HermesSanitize.operatorText;

describe('private operator text', () => {
  it('retains useful content words, paths, commands and structured results', () => {
    const text = 'token usage: 123 password reset required /home/brian/src/state.js {"output":"tests passed"}';
    expect(clean(text)).toBe(text);
    expect(clean('commit ' + 'a'.repeat(64))).toContain('a'.repeat(64));
  });
  it.each([
    'api_key="private-value"', '{"password":"private-value"}',
    'Authorization: Bearer private-value', 'Cookie: session=private-value; other=value',
    'https://example.test/?sig=private-value&mode=view',
    'https://example.test/?X-Amz-Signature=private-value',
    '-----BEGIN PRIVATE KEY-----\nprivate-value\n-----END PRIVATE KEY-----',
  ])('redacts actual credentials: %s', value => {
    expect(clean(value)).not.toContain('private-value');
    expect(clean(value)).toContain('[redacted]');
  });
  it('redacts before truncating and returns inert text for textContent', () => {
    expect(clean('api_key=' + 'a'.repeat(90), 24)).toBe('[redacted]');
    expect(clean('<img src=x onerror=alert(1)>')).toBe('<img src=x onerror=alert(1)>');
  });
});
