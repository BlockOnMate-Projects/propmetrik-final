/**
 * Welcome email — sent on signup and re-sendable on demand.
 * Best-effort: the caller decides whether to await; failures never throw out.
 * The email-verification CTA is included ONLY while the user is still unverified.
 */
import jwt from 'jsonwebtoken';
import { pool } from '../../database';
import { logger } from '../../utils/logger';
import config from '../../config';
import { notify } from '../../../shared-services/notifications/notify';
import { resolveReportBranding } from '../valuation-engine/brandingService';

const JWT_SECRET = config.jwt.secret;
const jwtVerifyExpiry = '3d';

export async function sendWelcomeEmail(opts: {
  userId: string;
  email: string;
  firstName: string;
  organizationId?: string | null;
}): Promise<void> {
  const { userId, organizationId } = opts;
  const normalizedEmail = opts.email.toLowerCase().trim();
  const name = (opts.firstName || '').trim() || 'there';
  const appUrl = config.app?.frontendUrl || 'https://propmetrik.com';

  // Resolve the org's branding (PM service) so the wordmark/CTA/footer reflect the
  // company rather than a hardcoded PROPMETRIK. Falls back to PROPMETRIK defaults.
  let brand: Awaited<ReturnType<typeof resolveReportBranding>> | null = null;
  try {
    brand = await resolveReportBranding(organizationId || null, {
      service: 'property_management',
      withLogo: false,
    });
  } catch (brandErr: any) {
    logger.warn('Welcome email: branding resolve failed (using defaults)', { error: brandErr?.message });
  }
  const isDefaultBrand = !brand || brand.name === 'PROPMETRIK';
  const brandName = brand?.name || 'PROPMETRIK';
  const headerBg = brand?.primaryColor || '#0a0a0a';
  const headerFg = brand?.onPrimary || '#ffffff';
  const accent = brand?.accentColor || '#f59e0b';
  const onAccent = brand?.onAccent || '#0a0a0a';
  // Wordmark: branded orgs get their (logo or) name; unbranded keeps the PROP<b>METRIK</b> look.
  const wordmark = isDefaultBrand
    ? `<span style="color:${headerFg};font-size:18px;font-weight:bold;letter-spacing:1px">PROP<span style="color:${accent}">METRIK</span></span>`
    : (brand?.logoUrl
        ? `<img src="${brand.logoUrl}" alt="${brandName}" style="max-height:34px;max-width:200px;display:block" />`
        : `<span style="color:${headerFg};font-size:18px;font-weight:bold;letter-spacing:1px">${brandName}</span>`);

  // Resolve the user's plan + verification status from the DB (no hardcoding).
  let plan: any = null;
  let emailVerified = false;
  try {
    const { rows } = await pool.query(
      `SELECT u.email_verified, sp.name, sp.description, sp.price_monthly_ghs, sp.trial_days, sp.features
         FROM users u
         LEFT JOIN subscription_plans sp
           ON sp.tier = u.subscription_tier AND sp.category = 'full_platform' AND sp.is_active = TRUE
        WHERE u.id = $1
        ORDER BY sp.sort_order
        LIMIT 1`,
      [userId]
    );
    if (rows[0]) {
      emailVerified = rows[0].email_verified === true;
      if (rows[0].name) plan = rows[0];
    }
  } catch (planErr: any) {
    logger.warn('Welcome email: lookup failed (sending without plan card)', { error: planErr?.message });
  }

  // Email-verification CTA — only while still unverified.
  let verifyBlock = '';
  let verifyText = '';
  if (!emailVerified) {
    const verifyToken = jwt.sign({ purpose: 'email_verify', userId, email: normalizedEmail }, JWT_SECRET, { expiresIn: jwtVerifyExpiry });
    const verifyUrl = `${appUrl}/verify-email?token=${verifyToken}`;
    verifyBlock = `
              <tr><td style="padding:14px 32px 0">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px">
                  <div style="color:#92400e;font-size:13px;line-height:19px;font-weight:bold;margin-bottom:2px">Confirm your email address</div>
                  <div style="color:#a16207;font-size:13px;line-height:19px">Verify your email to secure your account. <a href="${verifyUrl}" style="color:#b45309;font-weight:bold;text-decoration:none">Verify email &rarr;</a></div>
                </td></tr></table>
              </td></tr>`;
    verifyText = `Confirm your email address: ${verifyUrl}`;
  }

  const trialDays = plan ? (Number(plan.trial_days) || 0) : 0;
  const priceMonthly = plan?.price_monthly_ghs != null ? Number(plan.price_monthly_ghs) : null;
  const planFeatures: string[] = Array.isArray(plan?.features)
    ? plan.features
    : (() => { try { return JSON.parse(plan?.features || '[]'); } catch { return []; } })();

  const trialBadge = trialDays > 0
    ? `<span style="display:inline-block;background:#fef3c7;color:#92400e;font-size:11px;font-weight:bold;letter-spacing:.3px;text-transform:uppercase;padding:3px 9px;border-radius:999px">${trialDays}-day free trial</span>`
    : '';
  const priceLine = priceMonthly != null
    ? `<div style="margin-top:6px;color:#71717a;font-size:13px">GHS ${priceMonthly.toLocaleString()}/month${trialDays > 0 ? ` after your ${trialDays}-day trial` : ''}</div>`
    : '';
  const featureRows = planFeatures.map((f) => `
                      <tr>
                        <td valign="top" style="padding:5px 10px 5px 0;width:18px"><span style="color:${accent};font-weight:bold;font-size:14px">&#10003;</span></td>
                        <td style="padding:5px 0;color:#3f3f46;font-size:14px;line-height:20px">${f}</td>
                      </tr>`).join('');

  const html = `
        <div style="display:none;max-height:0;overflow:hidden;opacity:0">Your PROPMETRIK account is ready${plan ? ` — here's what's included in your ${plan.name} plan` : ''}.</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;font-family:Arial,Helvetica,sans-serif">
          <tr><td align="center">
            <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4e4e7">
              <tr><td style="background:${headerBg};padding:20px 32px">
                ${wordmark}
              </td></tr>
              <tr><td style="padding:32px 32px 8px">
                <h1 style="margin:0;color:#0a0a0a;font-size:22px;line-height:28px">Welcome, ${name} 🎉</h1>
                <p style="margin:12px 0 0;color:#52525b;font-size:15px;line-height:22px">Your account is ready. ${isDefaultBrand ? 'PROPMETRIK is' : `${brandName}, powered by PROPMETRIK, is`} the operating system for African real estate — valuations, property &amp; project management, CRM, and market data in one place.</p>
              </td></tr>
              ${verifyBlock}
              ${plan ? `<tr><td style="padding:20px 32px 8px">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #e4e4e7;border-radius:12px">
                  <tr><td style="padding:18px 20px 6px">
                    <div style="color:#a1a1aa;font-size:11px;font-weight:bold;letter-spacing:.6px;text-transform:uppercase;margin-bottom:6px">Your plan</div>
                    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                      <td style="color:#0a0a0a;font-size:18px;font-weight:bold;padding-right:10px">${plan.name}</td>
                      <td>${trialBadge}</td>
                    </tr></table>
                    <div style="margin-top:4px;color:#71717a;font-size:13px">${plan.description || ''}</div>
                    ${priceLine}
                  </td></tr>
                  ${featureRows ? `<tr><td style="padding:8px 20px 18px">
                    <div style="border-top:1px solid #ececee;padding-top:14px;color:#0a0a0a;font-size:13px;font-weight:bold;margin-bottom:6px">What's included</div>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${featureRows}</table>
                  </td></tr>` : ''}
                </table>
              </td></tr>` : ''}
              <tr><td style="padding:18px 32px 8px" align="center">
                <a href="${appUrl}/dashboard" style="background:${accent};color:${onAccent};text-decoration:none;padding:13px 28px;border-radius:10px;font-weight:bold;font-size:15px;display:inline-block">Go to your dashboard &rarr;</a>
              </td></tr>
              <tr><td style="padding:14px 32px 28px" align="center">
                <p style="margin:0;color:#71717a;font-size:13px;line-height:20px">New here? <a href="${appUrl}/dashboard/properties" style="color:#b45309;text-decoration:none">Add a property</a> &nbsp;·&nbsp; <a href="${appUrl}/dashboard/valuations" style="color:#b45309;text-decoration:none">Run a valuation</a> &nbsp;·&nbsp; <a href="${appUrl}/resources" style="color:#b45309;text-decoration:none">Browse guides</a></p>
              </td></tr>
              <tr><td style="background:#fafafa;border-top:1px solid #e4e4e7;padding:18px 32px">
                <p style="margin:0;color:#a1a1aa;font-size:12px;line-height:18px">Signed in as ${normalizedEmail}. Need more seats, unlimited valuations or CRM? <a href="${appUrl}/dashboard/billing" style="color:#b45309;text-decoration:none">Upgrade your plan</a>.<br/>If you didn't create this account, please <a href="mailto:support@propmetrik.com" style="color:#b45309;text-decoration:none">contact support</a>.</p>
              </td></tr>
            </table>
          </td></tr>
        </table>`;

  const text = [
    `Welcome to PROPMETRIK, ${name}!`,
    ``,
    plan
      ? `Your account is ready. You're on the ${plan.name} plan${trialDays > 0 ? ` (${trialDays}-day free trial)` : ''}.`
      : `Your account is ready.`,
    plan && planFeatures.length ? `\nWhat's included:\n${planFeatures.map((f) => `  - ${f}`).join('\n')}\n` : ``,
    verifyText,
    ``,
    `Go to your dashboard: ${appUrl}/dashboard`,
    `Signed in as ${normalizedEmail}. If this wasn't you, contact support@propmetrik.com.`,
  ].filter((line) => line !== ``).join('\n');

  await notify({
    recipients: { audience: 'staff', userId, email: normalizedEmail, name },
    category: 'system',
    type: 'account.created',
    title: 'Welcome to PROPMETRIK',
    body: `Hi ${name}, your PROPMETRIK account is ready${plan ? ` — you're on the ${plan.name} plan` : ''}.`,
    organizationId: organizationId || undefined,
    channels: { inApp: true, email: true },
    sourceUrl: `${appUrl}/dashboard`,
    email: {
      subject: `Welcome to PROPMETRIK, ${name} 🎉`,
      html,
      text,
    },
  });
}
