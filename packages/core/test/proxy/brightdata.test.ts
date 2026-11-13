import { beforeAll, describe, expect, it } from 'vitest';
import { brightdataApiKey } from '../../src/constants.js';
import { Logger } from '../../src/logger.js';
import { BrightDataForwardProxy } from '../../src/proxy/BrightDataForwardProxy.js';
import { CdpProxy } from '../../src/proxy/CdpProxy.js';
import { createBrightdataProxies, removeBrightdataProxies } from '../../src/proxy/provision.js';
import { expectBrowserGeoIp, expectGeoIp, geoIpUrl } from './geo.js';

// Run explicitly with npm run test:brightdata. Keep the shared datacenter zone for reuse.
const prefix = 'fetchfox';
const ids = [`${prefix}-datacenterShared`];
const expectedNames = [`${prefix}_dc_shared`];

const listZones = async (): Promise<string[]> => {
  const resp = await fetch('https://api.brightdata.com/zone/get_all_zones', {
    headers: { Authorization: `Bearer ${brightdataApiKey}` },
    signal: AbortSignal.timeout(30_000),
  });
  expect(resp.ok).toBe(true);
  const zones: { name: string; status: string }[] = await resp.json();
  return zones
    .filter((zone) => zone.status !== 'deleted')
    .map((zone) => zone.name)
    .sort();
};

describe.runIf(Boolean(brightdataApiKey?.trim()))('Bright Data provisioning (real API)', () => {
  let original: string[] = [];

  beforeAll(async () => {
    original = await listZones();
  }, 180_000);

  it('rejects unsafe prefixes, long zone names, and missing keys', async () => {
    for (const val of ['', ' ', '*', 'fetchfoxTest-']) {
      await expect(removeBrightdataProxies(val, { logger: new Logger() })).rejects.toThrow(
        'prefix'
      );
      await expect(
        createBrightdataProxies(val, ['datacenterShared'], { logger: new Logger() })
      ).rejects.toThrow('prefix');
    }
    await expect(
      removeBrightdataProxies(undefined as never, { logger: new Logger() })
    ).rejects.toThrow('prefix');
    await expect(
      removeBrightdataProxies(null as never, { logger: new Logger() })
    ).rejects.toThrow('prefix');
    await expect(
      createBrightdataProxies(prefix, [], { logger: new Logger(), apiKey: '' })
    ).rejects.toThrow('API_KEY');
    await expect(
      removeBrightdataProxies(prefix, { logger: new Logger(), apiKey: '' })
    ).rejects.toThrow('API_KEY');
    await expect(
      createBrightdataProxies(prefix.repeat(6), ['datacenterShared'], { logger: new Logger() })
    ).rejects.toThrow(
      /Could not provision Bright Data proxy .*Completed zones: none\..*30 characters/
    );
  });

  it('creates usable proxies and reuses the real zones without changing unrelated zones', async () => {
    const registry = await createBrightdataProxies(prefix, ['datacenterShared'], {
      logger: new Logger(),
    });
    expect(registry.list().map((proxy) => proxy.id)).toEqual(ids);
    const names = ids.map((id) => (registry.require(id) as BrightDataForwardProxy).zone);
    expect(names).toEqual(expectedNames);
    const expected = [...new Set([...original, ...names])].sort();
    expect(await listZones()).toEqual(expected);

    const repeated = await createBrightdataProxies(prefix, ['datacenterShared'], {
      logger: new Logger(),
    });
    expect(repeated.list().map((proxy) => proxy.id)).toEqual(ids);
    expect(ids.map((id) => (repeated.require(id) as BrightDataForwardProxy).zone)).toEqual(names);
    expect(await listZones()).toEqual(expected);

    const subset = await createBrightdataProxies(prefix, ['datacenterShared', 'datacenterShared'], {
      logger: new Logger(),
    });
    expect(subset.list().map((proxy) => proxy.id)).toEqual(ids);

    for (const id of ids) {
      const proxy = registry.require(id);
      // Assert booleans, not whole instances, so failures cannot print API keys.
      expect(proxy instanceof BrightDataForwardProxy, id).toBe(true);
      await expectGeoIp(await (proxy as BrightDataForwardProxy).fetch(geoIpUrl));
    }

    expect(await listZones()).toEqual(expected);
  }, 900_000);

  it('provisions residentialCdp explicitly and reuses its browser zone', async () => {
    const registry = await createBrightdataProxies(prefix, ['residentialCdp'], {
      logger: new Logger(),
    });
    const id = `${prefix}-residentialCdp`;
    expect(registry.list().map((proxy) => proxy.id)).toEqual([id]);
    const proxy = registry.require(id);
    // Do not print the credential-bearing proxy or URL on assertion failures.
    expect(proxy instanceof CdpProxy).toBe(true);
    const repeated = await createBrightdataProxies(prefix, ['residentialCdp'], {
      logger: new Logger(),
    });
    expect((repeated.require(id) as CdpProxy).cdpUrl === (proxy as CdpProxy).cdpUrl).toBe(true);
    const browser = await (proxy as CdpProxy).launchBrowser();
    try {
      const page = await browser.newPage();
      await expectBrowserGeoIp(page);
    } finally {
      await browser.close();
    }
  }, 180_000);
});
