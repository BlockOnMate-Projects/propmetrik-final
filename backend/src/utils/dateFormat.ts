export const GHANA_DATE_LOCALE = 'en-GB';

export type DateInput = Date | string | number | null | undefined;

function parseDate(input: DateInput): Date | null {
  if (input === null || input === undefined || input === '') {
    return null;
  }

  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(
  input: DateInput,
  options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }
): string {
  const date = parseDate(input);
  if (!date) {
    return '—';
  }

  // eslint-disable-next-line no-restricted-properties
  return date.toLocaleDateString(GHANA_DATE_LOCALE, options);
}

export function formatDateTime(
  input: DateInput,
  options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }
): string {
  const date = parseDate(input);
  if (!date) {
    return '—';
  }

  return date.toLocaleString(GHANA_DATE_LOCALE, options);
}
