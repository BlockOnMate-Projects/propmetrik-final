import {
  calculateChecksum,
  isStrictMigrationChecksumEnabled,
} from '../../../src/database/migrate';

describe('migrate checksum helpers', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalStrictFlag = process.env.MIGRATION_STRICT_CHECKSUM;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.MIGRATION_STRICT_CHECKSUM = originalStrictFlag;
  });

  it('calculateChecksum should be stable for the same content', () => {
    const first = calculateChecksum('CREATE TABLE example (id INT);');
    const second = calculateChecksum('CREATE TABLE example (id INT);');

    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });

  it('calculateChecksum should change when migration content changes', () => {
    const before = calculateChecksum('CREATE TABLE example (id INT);');
    const after = calculateChecksum('CREATE TABLE example (id BIGINT);');

    expect(before).not.toBe(after);
  });

  it('isStrictMigrationChecksumEnabled should be false in test by default', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.MIGRATION_STRICT_CHECKSUM;

    expect(isStrictMigrationChecksumEnabled()).toBe(false);
  });

  it('isStrictMigrationChecksumEnabled should be true in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.MIGRATION_STRICT_CHECKSUM;

    expect(isStrictMigrationChecksumEnabled()).toBe(true);
  });

  it('isStrictMigrationChecksumEnabled should honor MIGRATION_STRICT_CHECKSUM=true', () => {
    process.env.NODE_ENV = 'development';
    process.env.MIGRATION_STRICT_CHECKSUM = 'true';

    expect(isStrictMigrationChecksumEnabled()).toBe(true);
  });
});
