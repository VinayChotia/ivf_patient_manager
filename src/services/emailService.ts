// src/services/emailService.ts
import nodemailer from 'nodemailer';
import { PrismaClient } from '@prisma/client';
import { getEncryption } from '../utils/encryption';
import { DecryptedPatient } from './patientService';

const prisma = new PrismaClient();

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

let transporter: nodemailer.Transporter | null = null;

/**
 * Initialize email transporter
 */
export function initializeEmailService(): nodemailer.Transporter {
  if (transporter) return transporter;

  const config: EmailConfig = {
    host: process.env.SMTP_HOST || 'smtp.sendgrid.net',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false, // true for 465, false for 587
    auth: {
      user: process.env.SMTP_USER || 'apikey',
      pass: process.env.SMTP_PASS || ''
    }
  };

  transporter = nodemailer.createTransport(config);
  return transporter;
}

/**
 * Send backup email with encrypted attachment
 */
export async function sendBackupEmail(
  encryptedData: Buffer,
  fileName: string,
  subject: string = 'Monthly IVF Data Backup'
): Promise<boolean> {
  try {
    const transport = initializeEmailService();
    const backupEmail = process.env.BACKUP_EMAIL;

    if (!backupEmail) {
      console.error('BACKUP_EMAIL not configured');
      return false;
    }

    const mailOptions = {
      from: process.env.SMTP_USER || 'noreply@example.com',
      to: backupEmail,
      subject: subject,
      text: 'Attached is your encrypted IVF patient data backup. Store this file safely. Only the system owner can decrypt it using the encryption key.',
      html: `
        <h2>${subject}</h2>
        <p>Attached is your encrypted IVF patient data backup.</p>
        <p><strong>Important:</strong> Store this file safely. Only the system owner can decrypt it using the encryption key.</p>
        <p>Backup generated at: ${new Date().toISOString()}</p>
      `,
      attachments: [
        {
          filename: fileName,
          content: encryptedData,
          contentType: 'application/octet-stream'
        }
      ]
    };

    const info = await transport.sendMail(mailOptions);
    console.log('✓ Backup email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending backup email:', error);
    return false;
  }
}

export async function sendVerificationCodeEmail(to: string, verificationCode: string): Promise<boolean> {
  try {
    const transport = initializeEmailService();

    const mailOptions = {
      from: process.env.SMTP_USER || 'noreply@example.com',
      to,
      subject: 'Your verification code',
      text: `Your backup email verification code is: ${verificationCode}`,
      html: `
        <p>Your backup email verification code is:</p>
        <p><strong>${verificationCode}</strong></p>
        <p>Enter this code in the app to verify your backup email.</p>
      `
    };

    const info = await transport.sendMail(mailOptions);
    console.log('✓ Verification email sent to', to, 'messageId:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending verification email:', error);
    return false;
  }
}

/**
 * Generate encrypted backup file content
 */
export function generateEncryptedBackup(patients: DecryptedPatient[]): string {
  const encryption = getEncryption();
  
  // Create CSV content with full patient data and cash entry details
  const headers = [
    'ID',
    'Date',
    'Patient Name',
    'Country Code',
    'Phone',
    'Address',
    'Package',
    'Cash',
    'Bank',
    'Balance',
    'Cash Entries'
  ];

  const rows = patients.map(patient => [
    patient.id,
    patient.date || '',
    patient.patientName || '',
    patient.countryCode || '',
    patient.phone || '',
    patient.address || '',
    patient.package || '',
    patient.cash || '',
    patient.bank || '',
    patient.balance || '',
    JSON.stringify(patient.cashEntries ?? [])
  ]);

  // Create CSV string with proper escaping
  const csvContent = [
    headers.map(h => `"${h}"`).join(','),
    ...rows.map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  // Encrypt the CSV content
  const encryptedBackup = encryption.encrypt(csvContent);
  
  return encryptedBackup;
}

export async function retryFailedBackups(): Promise<{
  total: number;
  succeeded: number;
  failed: number;
  failures: Array<{ id: string; fileName: string; error: string }>;
}> {
  const failedBackups = await prisma.backup.findMany({
    where: { emailSent: false }
  });

  const result = {
    total: failedBackups.length,
    succeeded: 0,
    failed: 0,
    failures: [] as Array<{ id: string; fileName: string; error: string }>
  };

  for (const backup of failedBackups) {
    try {
      const emailSent = await sendBackupEmail(
        Buffer.from(backup.encryptedData, 'utf8'),
        backup.fileName,
        'Backup Retry'
      );

      if (emailSent) {
        await prisma.backup.update({
          where: { id: backup.id },
          data: {
            emailSent: true,
            emailSentAt: new Date()
          }
        });
        result.succeeded += 1;
      } else {
        result.failed += 1;
        result.failures.push({ id: backup.id, fileName: backup.fileName, error: 'Email send failed' });
      }
    } catch (error) {
      result.failed += 1;
      result.failures.push({
        id: backup.id,
        fileName: backup.fileName,
        error: (error as Error).message
      });
      console.error(`Retry failed for backup ${backup.id}:`, error);
    }
  }

  return result;
}
