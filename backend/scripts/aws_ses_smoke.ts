import { AwsSESEmailService } from '../shared-services/notifications/unified';

function pick(...values: Array<string | undefined>): string {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() || '';
}

async function main(): Promise<void> {
  const timestamp = new Date().toISOString();
  const recipient = pick(
    process.env.SMOKE_TEST_TO,
    process.env.AWS_SES_TEST_TO,
    process.env.AWS_SES_FROM_EMAIL,
  );

  if (recipient.length === 0) {
    throw new Error('No recipient configured. Set SMOKE_TEST_TO, AWS_SES_TEST_TO, or AWS_SES_FROM_EMAIL in backend/.env');
  }

  const sesService = new AwsSESEmailService();
  const result = await sesService.send({
    to: recipient,
    subject: `[Smoke] AWS SES email ${timestamp}`,
    text: `AWS SES provider smoke test at ${timestamp}`,
    html: `<p>AWS SES provider smoke test at <strong>${timestamp}</strong></p>`,
  });

  console.log(JSON.stringify({ awsSes: result, recipient }, null, 2));
}

main().catch((error: Error) => {
  console.error('AWS_SMOKE_TEST_FAILED:', error.message);
  process.exit(1);
});
