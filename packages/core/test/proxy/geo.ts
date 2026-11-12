import type { Page } from 'playwright';
import { expect } from 'vitest';

export const geoIpUrl = 'https://httpbin.org/ip';

export const expectGeoIp = async (resp: Response): Promise<void> => {
  expect(resp.ok).toBe(true);
  await expect(resp.json()).resolves.toMatchObject({
    origin: expect.any(String),
  });
};

const transientStatuses = new Set([429, 500, 502, 503, 504]);

export const expectBrowserGeoIp = async (page: Page): Promise<void> => {
  let status: number | undefined;
  for (let i = 0; i < 3; i++) {
    const resp = await page.goto(geoIpUrl, { timeout: 120_000 });
    if (resp?.ok()) {
      await expect(resp.json()).resolves.toMatchObject({ origin: expect.any(String) });
      return;
    }

    status = resp?.status();
    if (status === undefined || !transientStatuses.has(status) || i === 2) {
      throw new Error(`Browser geo-IP request failed with status ${status ?? 'no response'}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000 * (i + 1)));
  }
};
