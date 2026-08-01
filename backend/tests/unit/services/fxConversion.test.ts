/**
 * FX conversion (USD → GHS) — money-path unit tests.
 *
 * Core policy under test: conversions use a LIVE rate or fail. There is NO
 * hardcoded fallback rate; if the live feed is unavailable the conversion must
 * throw so the caller aborts the charge rather than guessing a rate.
 */

// Mock the DB pool so importing the service never opens a real connection,
// and so the fire-and-forget rate-logging insert is a no-op.
jest.mock('../../../src/database', () => ({
  pool: { query: jest.fn().mockResolvedValue({ rows: [] }) },
}));

// Mock the live FX source. Each test controls what the feed returns/throws.
const getExchangeRate = jest.fn();
jest.mock('../../../src/services/data-hub/economicDataService', () => ({
  economicDataService: { getExchangeRate: (...args: any[]) => getExchangeRate(...args) },
}));

import { exchangeRateService } from '../../../shared-services/payments/crypto/exchangeRateService';

beforeEach(() => {
  getExchangeRate.mockReset();
  exchangeRateService.clearCache(); // rate is cached 5min; isolate each test
});

describe('exchangeRateService.convertUsdToGhs', () => {
  it('converts USD to GHS at the live rate and reports the rate + source', async () => {
    getExchangeRate.mockResolvedValue({ rate: 15.5, source: 'ForexRate-API' });

    const out = await exchangeRateService.convertUsdToGhs(1000);

    expect(out.ghsAmount).toBe(15500); // 1000 × 15.5
    expect(out.usdAmount).toBe(1000);
    expect(out.rate).toBe(15.5);
    expect(out.source).toBe('data-hub:ForexRate-API');
    expect(out.fetchedAt).toBeInstanceOf(Date);
  });

  it('rounds the GHS result to 2 decimal places', async () => {
    getExchangeRate.mockResolvedValue({ rate: 15.337, source: 'Yahoo' });
    const out = await exchangeRateService.convertUsdToGhs(99.99);
    // 99.99 × 15.337 = 1533.554 63 → 1533.55
    expect(out.ghsAmount).toBe(1533.55);
  });

  it('THROWS when the live feed is unavailable — never falls back to a hardcoded rate', async () => {
    getExchangeRate.mockRejectedValue(new Error('all sources failed'));
    await expect(exchangeRateService.convertUsdToGhs(1000)).rejects.toThrow();
  });

  it('THROWS when the feed returns an invalid (zero / NaN) rate', async () => {
    getExchangeRate.mockResolvedValue({ rate: 0, source: 'ForexRate-API' });
    await expect(exchangeRateService.convertUsdToGhs(1000)).rejects.toThrow(/invalid/i);
  });

  it('rejects non-positive amounts', async () => {
    await expect(exchangeRateService.convertUsdToGhs(0)).rejects.toThrow(/positive/i);
    await expect(exchangeRateService.convertUsdToGhs(-5)).rejects.toThrow(/positive/i);
    expect(getExchangeRate).not.toHaveBeenCalled(); // fails before hitting the feed
  });
});

describe('exchangeRateService.normalizeToGhs', () => {
  it('passes GHS through untouched with no FX lookup (rate 1)', async () => {
    const out = await exchangeRateService.normalizeToGhs(2500, 'GHS');
    expect(out.ghsAmount).toBe(2500);
    expect(out.rate).toBe(1);
    expect(getExchangeRate).not.toHaveBeenCalled();
  });

  it('converts USD obligations via the live rate', async () => {
    getExchangeRate.mockResolvedValue({ rate: 15.5, source: 'ForexRate-API' });
    const out = await exchangeRateService.normalizeToGhs(1000, 'usd'); // case-insensitive
    expect(out.ghsAmount).toBe(15500);
    expect(out.rate).toBe(15.5);
  });

  it('refuses unsupported currencies rather than charging an unconverted amount', async () => {
    await expect(exchangeRateService.normalizeToGhs(1000, 'JPY')).rejects.toThrow(/unsupported/i);
    expect(getExchangeRate).not.toHaveBeenCalled();
  });

  it('converts GBP obligations via the live rate', async () => {
    getExchangeRate.mockResolvedValue({ rate: 19.8, source: 'ForexRate-API' });
    const out = await exchangeRateService.normalizeToGhs(100, 'GBP');
    expect(out.ghsAmount).toBe(1980);
    expect(out.rate).toBe(19.8);
    expect(getExchangeRate).toHaveBeenCalledWith('GBP');
  });
});
