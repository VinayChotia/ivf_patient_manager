// prisma/seed.ts
import { PrismaClient, UserRole } from '@prisma/client';
import bcryptjs from 'bcryptjs';

const prisma = new PrismaClient();

function generateRandomPassword(length: number = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#%^&*';
  let password = '';
  for (let i = 0; i < length; i += 1) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

async function main() {
  try {
    // Hash the panic PIN (6 digits) - default: 123456
    const panicPinHash = await bcryptjs.hash('123456', 10);

    const createdUsers: { username: string; password: string; role: string }[] = [];
    const existingUsers: { username: string; role: string }[] = [];

    const ensureUser = async (username: string, email: string, role: 'OWNER' | 'ACCOUNTANT' | 'SECRETARY') => {
      const existing = await prisma.user.findUnique({ where: { username } });
      if (existing) {
        console.log(`  ℹ️  User already exists: ${username} (${role})`);
        existingUsers.push({ username, role });
        return;
      }

      const tempPassword = generateRandomPassword(8);
      const passwordHash = await bcryptjs.hash(tempPassword, 10);

      const created = await prisma.user.create({
        data: {
          username,
          email,
          passwordHash,
          role,
          panicPinHash: role === 'OWNER' ? panicPinHash : undefined,
          mustChangePassword: true,
        },
      });

      console.log(`  ✓ Created ${role} user: ${created.username}`);
      console.log(`    Temporary password: ${tempPassword}`);
      createdUsers.push({ username: created.username, password: tempPassword, role });
    };

    console.log('\n🌱 Seeding users...');
    await ensureUser('rakesh', 'owner@example.com', 'OWNER');
    await ensureUser('owner2', 'owner2@example.com', 'OWNER');
    await ensureUser('accountant', 'accountant@example.com', 'ACCOUNTANT');
    await ensureUser('secretary', 'secretary@example.com', 'SECRETARY');

    console.log('\n✅ Seeding completed successfully!');
    
    if (createdUsers.length > 0) {
      console.log('\n📋 New users created. Share these credentials securely:');
      createdUsers.forEach(user => {
        console.log(`   ${user.username}: ${user.password} (${user.role})`);
      });
      console.log('\n⚠️  Users MUST change password on first login.');
    }
    
    if (existingUsers.length > 0) {
      console.log('\n📌 Existing users (manage via staff management UI):');
      existingUsers.forEach(user => {
        console.log(`   ${user.username} (${user.role})`);
      });
    }
  } catch (error) {
    console.error('Seeding error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
