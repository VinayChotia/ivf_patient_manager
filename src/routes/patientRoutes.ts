// src/routes/patientRoutes.ts
import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth';
import {
  createPatient,
  getPatientById,
  getAllPatients,
  updatePatient,
  deletePatient,
  createCashEntry,
  createBankEntry,
  PatientData
} from '../services/patientService';
import { logAudit } from '../services/auditService';

const router = Router();

/**
 * POST /api/patients
 * Create a new patient record
 * Only OWNER can create (or SECRETARY for non-financial fields)
 */
router.post('/', authMiddleware, requireRole('OWNER', 'SECRETARY'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const data: PatientData = req.body;

    // Secretary cannot submit financial data
    if (req.user.role === 'SECRETARY') {
      if (data.cash || data.bank || data.balance || (data.cashEntries && data.cashEntries.length > 0) || (data.bankEntries && data.bankEntries.length > 0)) {
        res.status(403).json({ error: 'Secretary cannot create financial fields' });
        return;
      }
    }

    const patient = await createPatient(data);

    // Log audit
    await logAudit({
      userId: req.user.id,
      action: 'CREATE',
      resourceType: 'PATIENT',
      resourceId: patient.id,
      ipAddress: req.ipAddress,
      details: { summary: `Created patient: ${data.patientName}` }
    });

    res.status(201).json({
      success: true,
      data: patient
    });
  } catch (error) {
    console.error('Create patient error:', error);
    res.status(500).json({ error: 'Failed to create patient' });
  }
});

/**
 * GET /api/patients
 * Get all patients (with role-based field masking)
 */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const patients = await getAllPatients(req.user.role);

    res.json({
      success: true,
      data: patients,
      count: patients.length
    });
  } catch (error) {
    console.error('Get patients error:', error);
    res.status(500).json({ error: 'Failed to retrieve patients' });
  }
});

/**
 * GET /api/patients/:id
 * Get a specific patient (with role-based field masking)
 */
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const patient = await getPatientById(req.params.id, req.user.role);

    if (!patient) {
      res.status(404).json({ error: 'Patient not found' });
      return;
    }

    res.json({
      success: true,
      data: patient
    });
  } catch (error) {
    console.error('Get patient error:', error);
    res.status(500).json({ error: 'Failed to retrieve patient' });
  }
});

/**
 * PATCH /api/patients/:id
 * Update a patient record (with role-based field validation)
 */
router.patch('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const data: Partial<PatientData> = req.body;

    try {
      const patient = await updatePatient(req.params.id, data, req.user.role);

      if (!patient) {
        res.status(404).json({ error: 'Patient not found' });
        return;
      }

      // Log audit
      await logAudit({
        userId: req.user.id,
        action: 'UPDATE',
        resourceType: 'PATIENT',
        resourceId: req.params.id,
        ipAddress: req.ipAddress,
        details: { fields: Object.keys(data) }
      });

      res.json({
        success: true,
        data: patient
      });
    } catch (error) {
      if ((error as Error).message.includes('cannot update')) {
        res.status(403).json({ error: (error as Error).message });
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('Update patient error:', error);
    res.status(500).json({ error: 'Failed to update patient' });
  }
});

/**
 * DELETE /api/patients/:id
 * Delete a patient record (OWNER only)
 */
router.delete('/:id', authMiddleware, requireRole('OWNER'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const success = await deletePatient(req.params.id);

    if (!success) {
      res.status(404).json({ error: 'Patient not found' });
      return;
    }

    // Log audit
    await logAudit({
      userId: req.user.id,
      action: 'DELETE',
      resourceType: 'PATIENT',
      resourceId: req.params.id,
      ipAddress: req.ipAddress
    });

    res.json({
      success: true,
      message: 'Patient deleted'
    });
  } catch (error) {
    console.error('Delete patient error:', error);
    res.status(500).json({ error: 'Failed to delete patient' });
  }
});

/**
 * POST /api/patients/:id/cash-entries
 * Create a cash entry for a patient
 * Only OWNER and ACCOUNTANT can create
 */
router.post('/:id/cash-entries', authMiddleware, requireRole('OWNER', 'ACCOUNTANT'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { entryDate, amount } = req.body;

    if (!entryDate || !amount) {
      res.status(400).json({ error: 'entryDate and amount are required' });
      return;
    }

    try {
      const entry = await createCashEntry(req.params.id, entryDate, amount);

      // Log audit
      await logAudit({
        userId: req.user.id,
        action: 'CREATE',
        resourceType: 'PATIENT',
        resourceId: req.params.id,
        ipAddress: req.ipAddress,
        details: { type: 'cash_entry', amount }
      });

      res.status(201).json({
        success: true,
        data: entry
      });
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('not found')) {
        res.status(404).json({ error: message });
      } else if (message.includes('Entry date cannot') || message.includes('would exceed')) {
        res.status(400).json({ error: message });
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('Create cash entry error:', error);
    res.status(500).json({ error: 'Failed to create cash entry' });
  }
});

/**
 * POST /api/patients/:id/bank-entries
 * Create a bank entry for a patient
 * Only OWNER and ACCOUNTANT can create
 */
router.post('/:id/bank-entries', authMiddleware, requireRole('OWNER', 'ACCOUNTANT'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { entryDate, amount } = req.body;

    if (!entryDate || !amount) {
      res.status(400).json({ error: 'entryDate and amount are required' });
      return;
    }

    try {
      const entry = await createBankEntry(req.params.id, entryDate, amount);

      // Log audit
      await logAudit({
        userId: req.user.id,
        action: 'CREATE',
        resourceType: 'PATIENT',
        resourceId: req.params.id,
        ipAddress: req.ipAddress,
        details: { type: 'bank_entry', amount }
      });

      res.status(201).json({
        success: true,
        data: entry
      });
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('not found')) {
        res.status(404).json({ error: message });
      } else if (message.includes('Entry date cannot') || message.includes('would exceed')) {
        res.status(400).json({ error: message });
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('Create bank entry error:', error);
    res.status(500).json({ error: 'Failed to create bank entry' });
  }
});

export default router;
