import { describe, expect, it } from 'vitest';
import { BrightDataForwardProxy } from '../../src/proxy/BrightDataForwardProxy.js';

describe('BrightDataForwardProxy', () => {
  it('uses its zone credentials and keeps browser cursors on separate sessions', () => {
    const proxy = new BrightDataForwardProxy({
      id: 'residential',
      customer: 'customer',
      password: 'password',
      server: 'brd.superproxy.io:44445',
      zone: 'fetchfox_residential',
      ignoreHTTPSErrors: true,
    });
    expect(proxy.browserContextOptions('first')).toEqual({
      ignoreHTTPSErrors: true,
      proxy: {
        server: 'http://brd.superproxy.io:44445/',
        username: 'brd-customer-customer-zone-fetchfox_residential-session-first',
        password: 'password',
      },
    });
    expect(proxy.browserContextOptions('second').proxy?.username).toBe(
      'brd-customer-customer-zone-fetchfox_residential-session-second'
    );
  });
});
