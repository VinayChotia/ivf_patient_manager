// prisma/seed.ts
import { PrismaClient, UserRole } from '@prisma/client';
import bcryptjs from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  try {
    // Hash passwords
    const ownerPasswordHash = await bcryptjs.hash('owner123', 10);
    const owner2PasswordHash = await bcryptjs.hash('owner543', 10);
    const accountantPasswordHash = await bcryptjs.hash('accountant123', 10);
    const secretaryPasswordHash = await bcryptjs.hash('secretary123', 10);

    // Hash the panic PIN (6 digits) - default: 123456
    const panicPinHash = await bcryptjs.hash('123456', 10);

    // ✅ upsert — safe to run on every deploy, won't crash if users already exist
    const owner = await prisma.user.upsert({
      where: { username: 'rakesh' },
      update: {},   // don't overwrite anything if already exists
      create: {
        username: 'rakesh',
        email: 'owner@example.com',
        passwordHash: ownerPasswordHash,
        role: 'OWNER' as UserRole,
        panicPinHash: panicPinHash,
      },
    });
    console.log('Upserted OWNER user:', owner.username);

    const owner2 = await prisma.user.upsert({
      where: { username: 'owner2' },
      update: {},
      create: {
        username: 'owner2',
        email: 'owner2@example.com',
        passwordHash: owner2PasswordHash,
        role: 'OWNER' as UserRole,
        panicPinHash: panicPinHash,
      },
    });
    console.log('Upserted OWNER user:', owner2.username);

    const accountant = await prisma.user.upsert({
      where: { username: 'accountant' },
      update: {},
      create: {
        username: 'accountant',
        email: 'accountant@example.com',
        passwordHash: accountantPasswordHash,
        role: 'ACCOUNTANT' as UserRole,
      },
    });
    console.log('Upserted ACCOUNTANT user:', accountant.username);

    const secretary = await prisma.user.upsert({
      where: { username: 'secretary' },
      update: {},
      create: {
        username: 'secretary',
        email: 'secretary@example.com',
        passwordHash: secretaryPasswordHash,
        role: 'SECRETARY' as UserRole,
      },
    });
    console.log('Upserted SECRETARY user:', secretary.username);

    console.log('\nSeeding completed successfully!');
    console.log('Test credentials:');
    console.log('  Owner:      rakesh / owner123');
    console.log('  Owner2:     owner2 / owner543');
    console.log('  Accountant: accountant / accountant123');
    console.log('  Secretary:  secretary / secretary123');
  } catch (error) {
    console.error('Seeding error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();