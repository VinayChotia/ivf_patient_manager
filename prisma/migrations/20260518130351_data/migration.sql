-- DropForeignKey
ALTER TABLE "CashEntry" DROP CONSTRAINT "CashEntry_patientId_fkey";

-- AddForeignKey
ALTER TABLE "CashEntry" ADD CONSTRAINT "CashEntry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
