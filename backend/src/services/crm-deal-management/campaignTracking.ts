/**
 * Campaign email tracking — signed open-pixel + click-redirect helpers.
 *
 * The drip execution engine injects a 1x1 open pixel and rewrites outbound links to a
 * signed redirect (`/api/track/*`, public routes). Signing (HMAC over sendId+url) prevents
 * the click endpoint from becoming an open redirector: only links WE generated verify.
 *
 * @module services/crm-deal-management/campaignTracking
 */

import crypto from 'crypto';
import { config } from '../../config';

const SECRET = process.env.TRACKING_SECRET || config.jwt.secret;

function baseUrl(): string {
    return config.app.url.replace(/\/$/, '');
}

export function signTracking(sendId: string, url: string): string {
    return crypto.createHmac('sha256', SECRET).update(`${sendId}:${url}`).digest('hex').slice(0, 32);
}

export function verifyTracking(sendId: string, url: string, sig: string): boolean {
    if (!sig) return false;
    const expected = signTracking(sendId, url);
    if (sig.length !== expected.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
        return false;
    }
}

export function openPixelUrl(sendId: string): string {
    return `${baseUrl()}/api/track/open/${sendId}.gif`;
}

export function clickUrl(sendId: string, target: string): string {
    const sig = signTracking(sendId, target);
    return `${baseUrl()}/api/track/click/${sendId}?u=${encodeURIComponent(target)}&s=${sig}`;
}

/**
 * Rewrite http(s) links in an HTML body through the signed click tracker and append the
 * open pixel. Skips mailto/tel/anchor links. Safe to call with plain-text bodies.
 */
export function injectTracking(html: string, sendId: string): string {
    if (!html) return html;
    const rewritten = html.replace(
        /(<a\b[^>]*?\bhref=)(["'])(https?:\/\/[^"']+)\2/gi,
        (_m, pre, q, url) => `${pre}${q}${clickUrl(sendId, url)}${q}`
    );
    const pixel = `<img src="${openPixelUrl(sendId)}" width="1" height="1" alt="" style="display:none;border:0" />`;
    return /<\/body>/i.test(rewritten)
        ? rewritten.replace(/<\/body>/i, `${pixel}</body>`)
        : rewritten + pixel;
}
