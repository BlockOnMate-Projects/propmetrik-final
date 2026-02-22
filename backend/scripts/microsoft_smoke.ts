import { MicrosoftGraphEmailService } from '../shared-services/notifications/unified';

function pick(...values: Array<string | undefined>): string {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() || '';
}

async function main(): Promise<void> {
  const timestamp = new Date().toISOString();
  const recipient = pick(
    process.env.SMOKE_TEST_TO,
    process.env.MS_SMTP_TEST_TO,
    process.env.MS_SMTP_FROM,
  );

  if (recipient.length === 0) {
    throw new Error('No recipient configured. Set SMOKE_TEST_TO, MS_SMTP_TEST_TO, or MS_SMTP_FROM in backend/.env');
  }

  const service = new MicrosoftGraphEmailService();
  const result = await service.send({
    to: recipient,
    subject: `[Smoke] Microsoft email ${timestamp}`,
    text: `Microsoft provider smoke test at ${timestamp}`,
    html: `<p>Microsoft provider smoke test at <strong>${timestamp}</strong></p>`,
  });

  console.log(JSON.stringify({ microsoft: result, recipient }, null, 2));
}

main().catch((error: Error) => {
  console.error('MICROSOFT_SMOKE_TEST_FAILED:', error.message);
  process.exit(1);
});
