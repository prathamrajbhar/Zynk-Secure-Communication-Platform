import { PrismaClient } from '@prisma/client';

// ============================================================================
// Test Setup — Global hooks for test suite
// ============================================================================

const prisma = new PrismaClient();

// Run before all tests
beforeAll(async () => {
  // Ensure database is ready
  await prisma.$connect();
});

// Run after all tests
afterAll(async () => {
  await prisma.$disconnect();
});

// Suppress console output during tests (uncomment to enable)
// const originalConsole = { ...console };
// beforeEach(() => {
//   console.log = jest.fn();
//   console.warn = jest.fn();
//   console.error = jest.fn();
// });
// afterEach(() => {
//   Object.assign(console, originalConsole);
// });
