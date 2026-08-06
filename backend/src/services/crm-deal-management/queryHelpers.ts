/**
 * Shared CRM query helpers — sort allowlists to prevent ORDER BY injection.
 */

const ALLOWED_SORT_ORDERS = new Set(['asc', 'desc']);

export function safeSortOrder(sortOrder?: string, defaultOrder: 'asc' | 'desc' = 'desc'): 'ASC' | 'DESC' {
  const normalized = (sortOrder || defaultOrder).toLowerCase();
  return ALLOWED_SORT_ORDERS.has(normalized) ? (normalized.toUpperCase() as 'ASC' | 'DESC') : defaultOrder.toUpperCase() as 'ASC' | 'DESC';
}

/** Returns `alias.column ASC|DESC` with column and direction validated against allowlists. */
export function buildCrmOrderBy(
  tableAlias: string,
  allowedColumns: readonly string[],
  sortBy: string | undefined,
  defaultColumn: string,
  sortOrder?: string,
  defaultOrder: 'asc' | 'desc' = 'desc',
): string {
  const col = sortBy && allowedColumns.includes(sortBy) ? sortBy : defaultColumn;
  return `${tableAlias}.${col} ${safeSortOrder(sortOrder, defaultOrder)}`;
}
