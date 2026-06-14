/*
  Warnings:

  - You are about to drop the column `partnerNameEncrypted` on the `Patient` table. All the data in the column will be lost.
  - You are about to drop the column `patientAgeEcrypted` on the `Patient` table. All the data in the column will be lost.
  - You are about to drop the column `patientIdEncrypted` on the `Patient` table. All the data in the column will be lost.
  - You are about to drop the column `treatmentStageEncrypted` on the `Patient` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Patient" DROP COLUMN "partnerNameEncrypted",
DROP COLUMN "patientAgeEcrypted",
DROP COLUMN "patientIdEncrypted",
DROP COLUMN "treatmentStageEncrypted";
