-- AlterTable
ALTER TABLE "Patient" ALTER COLUMN "dateEncrypted" DROP NOT NULL,
ALTER COLUMN "patientNameEncrypted" DROP NOT NULL,
ALTER COLUMN "phoneEncrypted" DROP NOT NULL,
ALTER COLUMN "addressEncrypted" DROP NOT NULL,
ALTER COLUMN "packageEncrypted" DROP NOT NULL,
ALTER COLUMN "cashEncrypted" DROP NOT NULL,
ALTER COLUMN "bankEncrypted" DROP NOT NULL,
ALTER COLUMN "balanceEncrypted" DROP NOT NULL;
