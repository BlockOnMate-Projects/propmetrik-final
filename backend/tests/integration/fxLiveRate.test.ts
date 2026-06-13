/**
 * Live FX rate — INTEGRATION test.
 *
 * Unlike the unit tests (which mock the feed to assert deterministic conversion
 * math + the no-fallback abort branch), this hits the REAL economic-data feed to
 * prove the production pipeline actually fetches a live, sane GHS/USD rate from a
 * real source — never a hardcoded number.
 *
 * It asserts sanity bounds (not an exact value, since the rate floats) and that
 * the source is a live provider, not a static fallback. Requires network; if the
 * feed is genuinely unreachable this test fails loudly — that's the intended
 * signal for an integration test (the production charge path would also abort).
 */

// The global test setup mocks `database/redis` but does not export `cache`,
// which fxFeedService uses. Override with a pass-through cache (always a miss)
// so the service performs the REAL live HTTP fetch this test is here to verify.
jest.mock('../../src/database/redis', () => ({
    redis: { get: jest.fn(), set: jest.fn(), setex: jest.fn(), del: jest.fn(), keys: jest.fn().mockResolvedValue([]), quit: jest.fn(), on: jest.fn(), connect: jest.fn() },
    cache: {
        get: jest.fn().mockResolvedValue(null),   // always a cache miss → go live
        set: jest.fn().mockResolvedValue(undefined),
        del: jest.fn().mockResolvedValue(undefined),
    },
}));

import { exchangeRateService } from '../../shared-services/payments/crypto/exchangeRateService';
import { query } from '../../src/database';

describe('FX live rate (integration — real feed)', () => {
    beforeEach(() => {
        exchangeRateService.clearCache();
        // The global test setup mocks the DB `query`. Return an empty result so the
        // DB-cache lookup is a clean MISS and the service falls through to the
        // real live HTTP feed (the thing this integration test exercises).
        (query as jest.Mock).mockResolvedValue({ rows: [] });
    });

    it('fetches a live, sane GHS/USD rate from a real data source', async () => {
        const r = await exchangeRateService.getGHSPerUSD();

        // A real rate, positive and within plausible bounds for GHS/USD.
        expect(r.ghsPerUsd).toBeGreaterThan(1);
        expect(r.ghsPerUsd).toBeLessThan(100);
        expect(Number.isFinite(r.ghsPerUsd)).toBe(true);

        // Provenance must be a live Data Hub source, not a hardcoded fallback.
        expect(r.source).toMatch(/^data-hub:/);
        expect(r.source.toLowerCase()).not.toContain('static');
        expect(r.source.toLowerCase()).not.toContain('fallback');

        // Freshly fetched.
        expect(r.fetchedAt).toBeInstanceOf(Date);
    }, 20000);

    it('converts USD→GHS using that live rate', async () => {
        const c = await exchangeRateService.convertUsdToGhs(1000);

        expect(c.usdAmount).toBe(1000);
        expect(c.rate).toBeGreaterThan(1);
        // ghsAmount == usdAmount × rate, rounded to 2dp
        expect(c.ghsAmount).toBeCloseTo(Math.round(1000 * c.rate * 100) / 100, 2);
        expect(c.source).toMatch(/^data-hub:/);
    }, 20000);
});
