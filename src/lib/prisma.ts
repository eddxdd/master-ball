/**
 * Shared Prisma Client Instance
 * Configured for Prisma 7 with database URL from environment
 */

import { PrismaClient } from '@prisma/client';
import { createRequire } from 'module';

// For Prisma 7, we need to use the adapter pattern
const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

export default prisma;
