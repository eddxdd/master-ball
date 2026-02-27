import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Create a single PrismaClient instance.
 *
 * - Uses Prisma Accelerate for runtime queries if DATABASE_URL uses prisma:// protocol
 * - Otherwise uses direct database connection via PrismaPg adapter
 * - Logs warnings and errors only (keeps noise low)
 */
const connectionString = process.env.DATABASE_URL || "";

let prismaInstance: PrismaClient;

if (connectionString.startsWith("prisma://")) {
  // Use Accelerate with accelerateUrl option
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { withAccelerate } = require("@prisma/extension-accelerate");
  const basePrisma = new PrismaClient({
    accelerateUrl: connectionString,
    log: ["warn", "error"],
  });
  prismaInstance = basePrisma.$extends(withAccelerate()) as PrismaClient;
} else {
  // Use direct connection via PrismaPg adapter (required for custom output path)
  const adapter = new PrismaPg({ connectionString });
  prismaInstance = new PrismaClient({
    adapter,
    log: ["warn", "error"],
  });
}

export default prismaInstance;