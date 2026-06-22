// src/index.ts
import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path'; // Imported to handle file routing cleanly
import { initializeEncryption } from './utils/encryption';
import { initializeScheduledJobs } from './services/scheduledJobsService';
import { retryFailedBackups } from './services/emailService';
import authRoutes from './routes/authRoutes';
import patientRoutes from './routes/patientRoutes';
import panicWipeRoutes from './routes/panicWipeRoutes';
import auditRoutes from './routes/auditRoutes';
import userRoutes from './routes/userRoutes';
import { PrismaClient } from '@prisma/client';

// Determine which environment we are running in (defaults to 'development')
const environment = process.env.NODE_ENV || 'development';

// Dynamically load the specific .env file from the root folder
dotenv.config({
  path: path.resolve(process.cwd(), `.env.${environment}`)
});

console.log(`📡 Loaded configuration from: .env.${environment}`);

const app: Express = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet()); // Security headers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware (expand as needed for frontend URLs)
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Initialize encryption service
try {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }
  initializeEncryption(encryptionKey);
  console.log('✓ Encryption service initialized');
} catch (error) {
  console.error('Failed to initialize encryption:', error);
  process.exit(1);
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/users', userRoutes);
app.use('/api/panic-wipe', panicWipeRoutes);
app.use('/api/audit', auditRoutes);

// Initialize scheduled jobs
initializeScheduledJobs();

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Admin retry endpoint for failed backup emails
app.get('/api/admin/retry-backup', async (req: Request, res: Response) => {
  const secret = String(req.query.secret || '');
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return res.status(404).json({ error: 'Route not found' });
  }

  try {
    const retryResult = await retryFailedBackups();
    return res.json({
      success: true,
      message: 'Retry completed',
      ...retryResult
    });
  } catch (error) {
    console.error('Admin retry-backup failed:', error);
    return res.status(500).json({ error: 'Retry failed', message: (error as Error).message });
  }
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`\n🚀 IVF Backend Server`);
  console.log(`📍 Running on http://localhost:${PORT}`);
  console.log(`🔐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`\n✓ Server is ready for requests\n`);

  void retryFailedBackupsOnStartup();
});

async function retryFailedBackupsOnStartup() {
  try {
    const retryResult = await retryFailedBackups();
    if (retryResult.total > 0) {
      console.log(`🛠️ Retried ${retryResult.total} failed backup email(s): ${retryResult.succeeded} succeeded, ${retryResult.failed} failed.`);
    }
  } catch (error) {
    console.error('Failed to retry pending backup emails on startup:', error);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down gracefully...');
  server.close(async () => {
    await prisma.$disconnect();
    console.log('✓ Database connection closed');
    process.exit(0);
  });
});

process.on('SIGTERM', async () => {
  console.log('\n\n🛑 Shutting down gracefully...');
  server.close(async () => {
    await prisma.$disconnect();
    console.log('✓ Database connection closed');
    process.exit(0);
  });
});

export default app;
