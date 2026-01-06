/**
 * Jest Test Setup
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Mock Redis client
jest.mock('../src/database/redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    keys: jest.fn().mockResolvedValue([]),
    quit: jest.fn(),
    on: jest.fn(),
    connect: jest.fn(),
  },
}));

// Mock database query function
jest.mock('../src/database', () => ({
  query: jest.fn(),
  pool: {
    connect: jest.fn(),
    end: jest.fn(),
  },
}));

// Silence console during tests unless debugging
if (!process.env.DEBUG_TESTS) {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    // Keep error visible
  };
}

// Global test timeout
jest.setTimeout(30000);

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Clean up after all tests
afterAll(async () => {
  // Allow any pending promises to settle
  await new Promise((resolve) => setTimeout(resolve, 100));
});
