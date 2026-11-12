import { beforeAll, describe, expect, it } from 'vitest';
import { brightdataApiKey } from '../../src/constants.js';
import { createLogger } from '../../src/logger.js';
import { BrightDataForwardProxy } from '../../src/proxy/BrightDataForwardProxy.js';
import { createBrightdataProxies } from '../../src/proxy/provision.js';
import { expectGeoIp, geoIpUrl } from './geo.js';

describe.runIf(Boolean(brightdataApiKey?.trim()))('BrightDataForwardProxy', () => {
  let proxy: BrightDataForwardProxy;

  beforeAll(async () => {
    const registry = await createBrightdataProxies('fetchfox', ['datacenterShared'], {
      logger: createLogger(),
    });
    proxy = registry.require('fetchfox-datacenterShared') as BrightDataForwardProxy;
  }, 180_000);

  it('fetches a geo IP response through Bright Data', async () => {
    const resp = await proxy.fetch(geoIpUrl);
    expect(resp.url).toBe(geoIpUrl);
    await expectGeoIp(resp);
  }, 120_000);

  it('returns the target status and URL for HTTP errors', async () => {
    const url = 'https://httpbin.org/status/404';
    const resp = await proxy.fetch(url);
    expect(resp.url).toBe(url);
    expect(resp.status).toBe(404);
    expect(resp.ok).toBe(false);
  }, 120_000);

  it('handles target responses that cannot have a body', async () => {
    const resp = await proxy.fetch('https://httpbin.org/status/204');
    expect(resp.status).toBe(204);
    expect(resp.body).toBeNull();
  }, 120_000);
});
