import { describe, expect, it } from 'vitest';
import { formatToolCall, getOrNull, norm, srid } from '../../src/util/index.js';

// eslint-disable-next-line no-control-regex -- Strips ANSI terminal formatting sequences.
const plain = (val: string): string => val.replace(/\u001B\[[0-?]*[ -/]*[@-~]/gu, '');

describe('srid', () => {
  it('returns hex IDs with the requested character length', () => {
    const ids = new Set(Array.from({ length: 50 }, () => srid(32, { hex: true })));
    expect(ids.size).toBe(50);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{32}$/);
    }
  });

  it('keeps the hex alphabet when retrying numeric IDs', () => {
    for (let i = 0; i < 50; i++) {
      expect(srid(1, { hex: true })).toMatch(/^[a-f]$/);
    }
  });

  it('supports prefixes with hex IDs and preserves existing call signatures', () => {
    expect(srid(8, { prefix: 'trace_', hex: true })).toMatch(/^trace_[0-9a-f]{8}$/);
    expect(srid()).toMatch(/^[a-z0-9]{14}$/);
    expect(srid(8)).toMatch(/^[a-z0-9]{8}$/);
    expect(srid(8, 'test_')).toMatch(/^test_[a-z0-9]{8}$/);
    expect(srid(8, { prefix: 'test_' })).toMatch(/^test_[a-z0-9]{8}$/);
    expect(srid('stable-input')).toBe(srid('stable-input'));
    expect(srid('stable-input')).toMatch(/^[a-z0-9]{14}$/);
  });
});

describe('getOrNull', () => {
  it('returns an object property when it exists', () => {
    expect(getOrNull<string>({ pageId: 'page-1' }, 'pageId')).toBe('page-1');
    expect(getOrNull<string>({}, 'pageId')).toBeNull();
    expect(getOrNull<string>(null, 'pageId')).toBeNull();
  });
});

describe('norm', () => {
  it('normalizes a URL without removing its fragment', () => {
    expect(norm('https://EXAMPLE.test:443/page?q=1#section')).toBe(
      'https://example.test/page?q=1#section'
    );
  });

  it('sorts and deduplicates URLs while preserving distinct hash routes', () => {
    expect(
      norm([
        'https://example.test/#/product/2',
        'https://EXAMPLE.test:443/#/product/1',
        'https://example.test/#/product/1',
      ])
    ).toEqual(['https://example.test/#/product/1', 'https://example.test/#/product/2']);
  });
});

describe('formatToolCall', () => {
  it('formats inputs for concise tool-call logs', () => {
    const formatted = formatToolCall('bot_run_extract', {
      _background: true,
      url: 'https://pokemondb.net/pokedex/charizard',
    });

    expect(formatted).not.toBe(plain(formatted));
    expect(plain(formatted)).toBe(
      'bot_run_extract { url: "https://pokemondb.net/pokedex/charizard" }'
    );
  });

  it('clips long formatted input at the requested limit', () => {
    const formatted = formatToolCall('bot_run_extract', { url: 'x'.repeat(250) });

    expect(plain(formatted)).toHaveLength('bot_run_extract '.length + 190);
    expect(plain(formatted)).toMatch(/\.\.\.$/u);
  });
});
