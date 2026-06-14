// src/services/scheduledJobsService.ts
import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { getAllPatientsForBackup, deleteAllPatients } from './patientService';
import { sendBackupEmail, generateEncryptedBackup, initializeEmailService } from './emailService';
import { logAudit } from './auditService';

const prisma = new PrismaClient();

/**
 * Schedule monthly backup on the 1st of every month at 2:00 AM
 */
export function scheduleMonthlyBackup(): cron.ScheduledTask {
  const job = cron.schedule('0 2 1 * *', async () => {
    console.log('\n📅 Running scheduled monthly backup...');
    try {
      const patients = await getAllPatientsForBackup();
      const encryptedBackup = generateEncryptedBackup(patients);
      const fileName = `ivf_backup_${new Date().toISOString().split('T')[0]}.enc`;
      const backupBuffer = Buffer.from(encryptedBackup, 'utf8');

      // Send email
      const emailSent = await sendBackupEmail(
        backupBuffer,
        fileName,
        'Monthly IVF Data Backup'
      );

      // Record backup in database
      await prisma.backup.create({
        data: {
          fileName: fileName,
          encryptedData: encryptedBackup,
          type: 'MONTHLY',
          emailSent: emailSent,
          emailSentAt: emailSent ? new Date() : null,
          notes: `Monthly backup of ${patients.length} patients`
        }
      });

      console.log(`✓ Monthly backup completed: ${patients.length} patients backed up`);

      // Log to audit (use system user ID)
      const systemUser = await prisma.user.findFirst({
        where: { role: 'OWNER' }
      });

      if (systemUser) {
        await logAudit({
          userId: systemUser.id,
          action: 'BACKUP',
          resourceType: 'SYSTEM',
          details: {
            type: 'MONTHLY',
            patientCount: patients.length,
            emailSent: emailSent
          }
        });
      }
    } catch (error) {
      console.error('❌ Monthly backup failed:', error);
    }
  });

  console.log('✓ Monthly backup scheduled (1st of month at 2:00 AM)');
  return job;
}

/**
 * Schedule automatic data deletion for records older than 6 months
 * Runs daily at 3:00 AM
 */
export function scheduleAutoDataDeletion(): cron.ScheduledTask {
  const job = cron.schedule('0 3 * * *', async () => {
    console.log('\n🗑️  Running scheduled data cleanup...');
    try {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const result = await prisma.patient.deleteMany({
        where: {
          createdAt: {
            lt: sixMonthsAgo
          }
        }
      });

      console.log(`✓ Cleanup completed: ${result.count} records older than 6 months deleted`);

      if (result.count > 0) {
        // Log to audit
        const systemUser = await prisma.user.findFirst({
          where: { role: 'OWNER' }
        });

        if (systemUser) {
          await logAudit({
            userId: systemUser.id,
            action: 'AUTO_DELETE',
            resourceType: 'SYSTEM',
            details: {
              recordsDeleted: result.count,
              criteria: 'older than 6 months'
            }
          });
        }
      }
    } catch (error) {
      console.error('❌ Data cleanup failed:', error);
    }
  });

  console.log('✓ Auto-delete job scheduled (daily at 3:00 AM)');
  return job;
}

/**
 * Initialize and start all scheduled jobs
 */
export function initializeScheduledJobs(): void {
  console.log('\n⏰ Initializing scheduled jobs...');
  
  try {
    initializeEmailService();
    scheduleMonthlyBackup();
    scheduleAutoDataDeletion();
    
    console.log('✓ All scheduled jobs initialized\n');
  } catch (error) {
    console.error('Failed to initialize scheduled jobs:', error);
  }
}
