import { PrioritySMTPEmailService } from '../shared-services/notifications/unified';

function pick(...values: Array<string | undefined>): string {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() || '';
}

function mask(value: string | undefined): string {
  if (!value) return '';
  if (value.length <= 6) return '***';
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}

async function run(mode: 'normal' | 'force-aws'): Promise<void> {
  const timestamp = new Date().toISOString();
  const recipient = pick(
    process.env.SMOKE_TEST_TO,
    process.env.PRIORITY_SMOKE_TO,
    process.env.GOOGLE_SMTP_FROM,
    process.env.AWS_SES_FROM_EMAIL,
  );

  if (!recipient) {
    throw new Error('No recipient configured. Set SMOKE_TEST_TO / PRIORITY_SMOKE_TO / GOOGLE_SMTP_FROM / AWS_SES_FROM_EMAIL');
  }

  if (mode === 'force-aws') {
    process.env.GOOGLE_SMTP_PASSWORD = '';
    process.env.GOOGLE_CLIENT_ID = '';
    process.env.GOOGLE_CLIENT_SECRET = '';
    process.env.GOOGLE_REFRESH_TOKEN = '';
  }

  const service = new PrioritySMTPEmailService();
  const result = await service.send({
    to: recipient,
    subject: `[Smoke] Priority email (${mode}) ${timestamp}`,
    text: `Priority provider smoke test in mode=${mode} at ${timestamp}`,
    html: `<p>Priority provider smoke test in mode=<strong>${mode}</strong> at <strong>${timestamp}</strong></p>`,
  });

  console.log(JSON.stringify({
    mode,
    result,
    recipient,
    envSnapshot: {
      msFrom: mask(process.env.MS_SMTP_FROM),
      googleFrom: mask(process.env.GOOGLE_SMTP_FROM || process.env.GOOGLE_SMTP_USER),
      awsFrom: mask(process.env.AWS_SES_FROM_EMAIL),
    },
  }, null, 2));
}

const modeArg = (process.argv[2] || 'normal').toLowerCase();
const mode = modeArg === 'force-aws' ? 'force-aws' : 'normal';

run(mode).catch((error: Error) => {
  console.error('PRIORITY_SMOKE_FAILED:', error.message);
  process.exit(1);
});
