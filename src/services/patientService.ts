// src/services/patientService.ts
import { PrismaClient, Patient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { getEncryption } from '../utils/encryption';
import { JWTPayload } from '../utils/jwt';

const prisma = new PrismaClient();

export interface CashEntryInput {
  entryDate?: string;
  amount?: string;
}

export interface PatientData {
  date?: string;
  patientName?: string;
  countryCode?: string;
  phone?: string;
  address?: string;
  package?: string;
  cash?: string;
  bank?: string;
  balance?: string;
  cashEntries?: CashEntryInput[];
  bankEntries?: CashEntryInput[];
}

export interface DecryptedCashEntry {
  id: string;
  entryDate: string;
  amount: string;
}

export interface DecryptedPatient {
  id: string;
  date?: string;
  patientName?: string;
  countryCode?: string;
  phone?: string;
  address?: string;
  package?: string;
  cash?: string;
  bank?: string;
  balance?: string;
  cashEntries?: DecryptedCashEntry[];
  bankEntries?: DecryptedCashEntry[];
  createdAt: Date;
  updatedAt: Date;
}

type PatientWithCashEntries = Patient & {
  cashEntries?: {
    id: string;
    entryDate: Date;
    amount: Decimal;
  }[];
  bankEntries?: {
    id: string;
    entryDate: Date;
    amount: Decimal;
  }[];
};

function parseDecimal(value: string | number | undefined | null): Decimal | null {
  if (value === undefined || value === null) return null;
  const normalized = typeof value === 'string' ? value.trim() : value.toString();
  if (normalized === '') return null;
  try {
    return new Decimal(normalized);
  } catch {
    return null;
  }
}

function formatDecimal(value: Decimal | null | undefined): string | undefined {
  if (!value) return undefined;
  return value.toString();
}

/**
 * Decrypt a patient record
 */
function decryptPatient(patient: PatientWithCashEntries): DecryptedPatient {
  const encryption = getEncryption();

  // safeDecrypt: if the stored value is empty/null, return undefined instead
  // of trying to decrypt an empty string (which causes "Invalid IV" crash)
  // Also catches decryption errors and returns undefined instead of throwing
  const safeDecrypt = (value: string | null | undefined): string | undefined => {
    if (!value || value.trim() === '') return undefined;
    try {
      return encryption.decrypt(value);
    } catch (error) {
      console.error('Decryption error for field:', (error as Error).message);
      return undefined;
    }
  };

  return {
    id: patient.id,
    date: patient.date ? patient.date.toISOString() : undefined,
    patientName: safeDecrypt(patient.patientNameEncrypted),
    countryCode: safeDecrypt(patient.countryCodeEncrypted),
    phone: safeDecrypt(patient.phoneEncrypted),
    address: safeDecrypt(patient.addressEncrypted),
    package: formatDecimal(patient.packageAmount),
    cash: formatDecimal(patient.cashTotal),
    bank: formatDecimal(patient.bankAmount),
    balance: formatDecimal(patient.balanceAmount),
    cashEntries: patient.cashEntries?.map(entry => ({
      id: entry.id,
      entryDate: entry.entryDate.toISOString(),
      amount: entry.amount.toString(),
    })),
    bankEntries: patient.bankEntries?.map(entry => ({
      id: entry.id,
      entryDate: entry.entryDate.toISOString(),
      amount: entry.amount.toString(),
    })),
    createdAt: patient.createdAt,
    updatedAt: patient.updatedAt
  };
}

/**
 * Encrypt patient string fields for storage
 */
function encryptPatientStrings(data: PatientData) {
  const encryption = getEncryption();

  // safeEncrypt: store NULL in DB for missing fields, never an empty string.
  // Empty string '' cannot be decrypted (no IV) and causes the crash.
  const safeEncrypt = (value: string | undefined | null): string | null => {
    if (value === undefined || value === null || value.trim() === '') return null;
    return encryption.encrypt(value);
  };

  return {
    patientNameEncrypted: safeEncrypt(data.patientName),
    countryCodeEncrypted: safeEncrypt(data.countryCode),
    phoneEncrypted:       safeEncrypt(data.phone),
    addressEncrypted:     safeEncrypt(data.address),
  };
}

/**
 * Filter patient data based on user role
 */
function filterPatientByRole(patient: DecryptedPatient, role: string): Partial<DecryptedPatient> {
  const filtered: Partial<DecryptedPatient> = {
    id: patient.id,
    createdAt: patient.createdAt,
    updatedAt: patient.updatedAt
  };

  switch (role) {
    case 'OWNER':
      // Owner sees everything
      return patient;
    
    case 'ACCOUNTANT':
      // Accountant sees: Package, Cash, Bank, Balance, Patient Name (no Phone/Address)
      return {
        ...filtered,
        date: patient.date,
        patientName: patient.patientName,
        package: patient.package,
        cash: patient.cash,
        bank: patient.bank,
        balance: patient.balance,
        cashEntries: patient.cashEntries,
        bankEntries: patient.bankEntries
      };
    
    case 'SECRETARY':
      // Secretary sees: Date, Patient Name, Phone, Address, Package (no Financial)
      return {
        ...filtered,
        date: patient.date,
        patientName: patient.patientName,
        countryCode: patient.countryCode,
        phone: patient.phone,
        address: patient.address,
        package: patient.package
      };
    
    default:
      return filtered;
  }
}

/**
 * Create a new patient record
 */
export async function createPatient(data: PatientData): Promise<DecryptedPatient> {
  const encrypted = encryptPatientStrings(data);

  const parsedPackageAmount = parseDecimal(data.package) ?? new Decimal(0);
  const parsedBankAmount = parseDecimal(data.bank) ?? new Decimal(0);

  const cashEntries = (data.cashEntries ?? []).map(entry => ({
    entryDate: entry.entryDate ? new Date(entry.entryDate) : new Date(),
    amount: parseDecimal(entry.amount) ?? new Decimal(0),
  }));

  const bankEntries = (data.bankEntries ?? []).map(entry => ({
    entryDate: entry.entryDate ? new Date(entry.entryDate) : new Date(),
    amount: parseDecimal(entry.amount) ?? new Decimal(0),
  }));

  // If registration date provided, validate all entry dates are on/after it
  const registrationDate = data.date ? new Date(data.date) : null;
  if (registrationDate) {
    for (const e of cashEntries) {
      if (e.entryDate < registrationDate) throw new Error('Cash entry date cannot be before patient registration date');
    }
    for (const e of bankEntries) {
      if (e.entryDate < registrationDate) throw new Error('Bank entry date cannot be before patient registration date');
    }
  }

  const cashTotal = cashEntries.reduce((sum, entry) => sum.plus(entry.amount), new Decimal(0));
  const resolvedCashTotal = cashEntries.length > 0
    ? cashTotal
    : parseDecimal(data.cash) ?? new Decimal(0);

  const bankTotal = bankEntries.reduce((sum, entry) => sum.plus(entry.amount), new Decimal(0));
  const resolvedBankTotal = bankEntries.length > 0
    ? bankTotal
    : parseDecimal(data.bank) ?? new Decimal(0);

  // Combined total must not exceed package
  const combined = resolvedCashTotal.plus(resolvedBankTotal);
  if (combined.gt(parsedPackageAmount)) {
    throw new Error('Combined cash and bank entries exceed package amount');
  }

  const patient = await prisma.patient.create({
    data: {
      ...encrypted,
      date: data.date ? new Date(data.date) : undefined,
      packageAmount: parsedPackageAmount,
      bankAmount: resolvedBankTotal,
      cashTotal: resolvedCashTotal,
      balanceAmount: parsedPackageAmount.minus(resolvedCashTotal.plus(resolvedBankTotal)),
      cashEntries: {
        create: cashEntries
      },
      bankEntries: {
        create: bankEntries
      }
    },
    include: { cashEntries: true, bankEntries: true }
  });

  return decryptPatient(patient);
}

/**
 * Get a patient by ID (with role-based filtering)
 */
export async function getPatientById(id: string, userRole: string): Promise<Partial<DecryptedPatient> | null> {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id },
      include: { cashEntries: true, bankEntries: true }
    });

    if (!patient) return null;

    try {
      const decrypted = decryptPatient(patient);
      return filterPatientByRole(decrypted, userRole);
    } catch (error) {
      console.error('Error decrypting patient:', id, (error as Error).message);
      // Return basic patient info without encrypted fields in case of decryption error
      return {
        id: patient.id,
        createdAt: patient.createdAt,
        updatedAt: patient.updatedAt
      };
    }
  } catch (error) {
    console.error('Error fetching patient:', error);
    throw error;
  }
}

/**
 * Get all patients (with role-based filtering)
 */
export async function getAllPatients(userRole: string): Promise<Partial<DecryptedPatient>[]> {
  try {
    const patients = await prisma.patient.findMany({
      orderBy: { createdAt: 'desc' },
      include: { cashEntries: true, bankEntries: true }
    });

    return patients.map(patient => {
      try {
        const decrypted = decryptPatient(patient);
        return filterPatientByRole(decrypted, userRole);
      } catch (error) {
        console.error('Error processing patient:', patient.id, (error as Error).message);
        // Return basic patient info without encrypted fields
        return {
          id: patient.id,
          createdAt: patient.createdAt,
          updatedAt: patient.updatedAt
        };
      }
    });
  } catch (error) {
    console.error('Error fetching patients:', error);
    throw error;
  }
}

/**
 * Update a patient record (with role-based field validation)
 */
export async function updatePatient(
  id: string,
  data: Partial<PatientData>,
  userRole: string
): Promise<Partial<DecryptedPatient> | null> {
  const patient = await prisma.patient.findUnique({
    where: { id },
    include: { cashEntries: true, bankEntries: true }
  });

  if (!patient) return null;

  validateUpdatePermissions(data, userRole);

  const enc = getEncryption();
  const safeEncrypt = (value: string | undefined | null): string | null => {
    if (value === undefined || value === null || value.trim() === '') return null;
    return enc.encrypt(value);
  };

  const updateData: any = {};

  // Basic fields
  if (data.date !== undefined)        updateData.date = data.date ? new Date(data.date) : null;
  if (data.patientName !== undefined) updateData.patientNameEncrypted = safeEncrypt(data.patientName);
  if (data.countryCode !== undefined) updateData.countryCodeEncrypted = safeEncrypt(data.countryCode);
  if (data.phone !== undefined)       updateData.phoneEncrypted       = safeEncrypt(data.phone);
  if (data.address !== undefined)     updateData.addressEncrypted     = safeEncrypt(data.address);

  const packageAmount = data.package !== undefined ? parseDecimal(data.package) : patient.packageAmount;
  if (data.package !== undefined) updateData.packageAmount = packageAmount;

  // ────── CASH ENTRIES ──────
  let cashTotal = patient.cashTotal ?? new Decimal(0);
  if (data.cashEntries !== undefined) {
    const cashEntries = data.cashEntries.map(entry => ({
      entryDate: entry.entryDate ? new Date(entry.entryDate) : new Date(),
      amount: parseDecimal(entry.amount) ?? new Decimal(0),
    }));
    cashTotal = cashEntries.reduce((sum, entry) => sum.plus(entry.amount), new Decimal(0));
    updateData.cashTotal = cashTotal;
    updateData.cashEntries = {
      deleteMany: {},
      create: cashEntries
    };
  } else if (data.cash !== undefined) {
    // Fallback single cash value (no date breakdown)
    cashTotal = parseDecimal(data.cash) ?? cashTotal;
    updateData.cashTotal = cashTotal;
  }

  // ────── BANK ENTRIES ────── (SAME LOGIC AS CASH)
  let bankTotal = patient.bankAmount ?? new Decimal(0);
  if (data.bankEntries !== undefined) {
    const bankEntries = data.bankEntries.map(entry => ({
      entryDate: entry.entryDate ? new Date(entry.entryDate) : new Date(),
      amount: parseDecimal(entry.amount) ?? new Decimal(0),
    }));
    bankTotal = bankEntries.reduce((sum, entry) => sum.plus(entry.amount), new Decimal(0));
    updateData.bankAmount = bankTotal;
    updateData.bankEntries = {
      deleteMany: {},
      create: bankEntries
    };
  } else if (data.bank !== undefined) {
    // Fallback single bank value
    bankTotal = parseDecimal(data.bank) ?? bankTotal;
    updateData.bankAmount = bankTotal;
  }

  // Recalculate balance
  const finalPackage = packageAmount ?? new Decimal(0);
  updateData.balanceAmount = finalPackage.minus(cashTotal.plus(bankTotal));

  const updated = await prisma.patient.update({
    where: { id },
    data: updateData,
    include: { cashEntries: true, bankEntries: true }
  });

  const decrypted = decryptPatient(updated);
  return filterPatientByRole(decrypted, userRole);
}

/**
 * Delete a patient record
 */
export async function deletePatient(id: string): Promise<boolean> {
  await prisma.cashEntry.deleteMany({
    where: { patientId: id }
  });

  const result = await prisma.patient.delete({
    where: { id }
  });
  return !!result;
}

/**
 * Delete all patients (for panic wipe)
 */
export async function deleteAllPatients(): Promise<number> {
  return await prisma.$transaction(async tx => {
    await tx.cashEntry.deleteMany();
    await tx.bankEntry.deleteMany();
    const result = await tx.patient.deleteMany();
    return result.count;
  });
}

/**
 * Get all unencrypted patients for backup
 */
export async function getAllPatientsForBackup(): Promise<DecryptedPatient[]> {
  const patients = await prisma.patient.findMany({
    orderBy: { createdAt: 'desc' },
    include: { cashEntries: true, bankEntries: true }
  });

  return patients.map(decryptPatient);
}

/**
 * Validate that user can update these fields
 */
function validateUpdatePermissions(data: Partial<PatientData>, role: string): void {
  if (role === 'ACCOUNTANT') {
    // Accountant can only update financial fields and package
    const allowedFields = ['package', 'cash', 'bank', 'balance', 'cashEntries', 'bankEntries'];
    const requestedFields = Object.keys(data);
    
    for (const field of requestedFields) {
      if (!allowedFields.includes(field)) {
        throw new Error(`Accountant cannot update field: ${field}`);
      }
    }
  } else if (role === 'SECRETARY') {
    // Secretary can only update non-financial fields
    const allowedFields = ['date', 'patientName', 'countryCode', 'phone', 'address', 'package'];
    const requestedFields = Object.keys(data);
    
    for (const field of requestedFields) {
      if (!allowedFields.includes(field)) {
        throw new Error(`Secretary cannot update field: ${field}`);
      }
    }
  }
  // OWNER can update all fields
}

/**
 * Create a cash entry for a patient
 */
export async function createCashEntry(
  patientId: string,
  entryDate: string,
  amount: string
): Promise<{ id: string; entryDate: string; amount: string }> {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: { cashEntries: true, bankEntries: true }
  });

  if (!patient) {
    throw new Error('Patient not found');
  }

  // Validate entry date is >= patient date
  if (patient.date) {
    const entryDateTime = new Date(entryDate);
    if (entryDateTime < patient.date) {
      throw new Error('Entry date cannot be before patient registration date');
    }
  }

  const parsedAmount = parseDecimal(amount);
  if (!parsedAmount || parsedAmount.lte(0)) {
    throw new Error('Invalid amount');
  }

  // Calculate current totals
  const cashTotal = (patient.cashEntries ?? []).reduce(
    (sum, entry) => sum.plus(entry.amount),
    new Decimal(0)
  );
  const bankTotal = (patient.bankEntries ?? []).reduce(
    (sum, entry) => sum.plus(entry.amount),
    new Decimal(0)
  );

  // Check that total won't exceed package
  const packageAmount = patient.packageAmount ?? new Decimal(0);
  const newTotal = cashTotal.plus(bankTotal).plus(parsedAmount);
  if (newTotal.gt(packageAmount)) {
    throw new Error('Entry would exceed package amount');
  }

  // Create the entry
  const entry = await prisma.cashEntry.create({
    data: {
      patientId,
      entryDate: new Date(entryDate),
      amount: parsedAmount
    }
  });

  return {
    id: entry.id,
    entryDate: entry.entryDate.toISOString(),
    amount: entry.amount.toString()
  };
}

/**
 * Create a bank entry for a patient
 */
export async function createBankEntry(
  patientId: string,
  entryDate: string,
  amount: string
): Promise<{ id: string; entryDate: string; amount: string }> {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: { cashEntries: true, bankEntries: true }
  });

  if (!patient) {
    throw new Error('Patient not found');
  }

  // Validate entry date is >= patient date
  if (patient.date) {
    const entryDateTime = new Date(entryDate);
    if (entryDateTime < patient.date) {
      throw new Error('Entry date cannot be before patient registration date');
    }
  }

  const parsedAmount = parseDecimal(amount);
  if (!parsedAmount || parsedAmount.lte(0)) {
    throw new Error('Invalid amount');
  }

  // Calculate current totals
  const cashTotal = (patient.cashEntries ?? []).reduce(
    (sum, entry) => sum.plus(entry.amount),
    new Decimal(0)
  );
  const bankTotal = (patient.bankEntries ?? []).reduce(
    (sum, entry) => sum.plus(entry.amount),
    new Decimal(0)
  );

  // Check that total won't exceed package
  const packageAmount = patient.packageAmount ?? new Decimal(0);
  const newTotal = cashTotal.plus(bankTotal).plus(parsedAmount);
  if (newTotal.gt(packageAmount)) {
    throw new Error('Entry would exceed package amount');
  }

  // Create the entry
  const entry = await prisma.bankEntry.create({
    data: {
      patientId,
      entryDate: new Date(entryDate),
      amount: parsedAmount
    }
  });

  return {
    id: entry.id,
    entryDate: entry.entryDate.toISOString(),
    amount: entry.amount.toString()
  };
}