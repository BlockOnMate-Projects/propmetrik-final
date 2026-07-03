/**
 * @deprecated Moved to the analytics layer — cap rate is now a first-class analytics output,
 * the single authority for ALL property types (standard + trading). Import from
 * `services/analytics/capRateService` instead. This shim re-exports it so any straggler
 * import keeps working during migration; delete once no imports reference this path.
 */
export * from '../analytics/capRateService';
export { capRateService } from '../analytics/capRateService';
