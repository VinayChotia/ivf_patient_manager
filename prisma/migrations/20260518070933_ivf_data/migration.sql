/*
  Warnings:

  - You are about to drop the column `balanceEncrypted` on the `Patient` table. All the data in the column will be lost.
  - You are about to drop the column `bankEncrypted` on the `Patient` table. All the data in the column will be lost.
  - You are about to drop the column `cashEncrypted` on the `Patient` table. All the data in the column will be lost.
  - You are about to drop the column `dateEncrypted` on the `Patient` table. All the data in the column will be lost.
  - You are about to drop the column `packageEncrypted` on the `Patient` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Patient" DROP COLUMN "balanceEncrypted",
DROP COLUMN "bankEncrypted",
DROP COLUMN "cashEncrypted",
DROP COLUMN "dateEncrypted",
DROP COLUMN "packageEncrypted",
ADD COLUMN     "balanceAmount" DECIMAL(65,30),
ADD COLUMN     "bankAmount" DECIMAL(65,30),
ADD COLUMN     "cashTotal" DECIMAL(65,30),
ADD COLUMN     "countryCodeEncrypted" TEXT,
ADD COLUMN     "date" TIMESTAMP(3),
ADD COLUMN     "packageAmount" DECIMAL(65,30);

-- CreateTable
CREATE TABLE "CashEntry" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashEntry_patientId_idx" ON "CashEntry"("patientId");

-- CreateIndex
CREATE INDEX "CashEntry_entryDate_idx" ON "CashEntry"("entryDate");

-- AddForeignKey
ALTER TABLE "CashEntry" ADD CONSTRAINT "CashEntry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
