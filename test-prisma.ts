import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Testing Prisma fields...');
    const record = await prisma.record.findFirst({
       take: 1,
       select: { routineId: true, deletedAt: true }
    });
    console.log('Success! Fields are present.');
  } catch (e: any) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
