-- CreateTable
CREATE TABLE "BankEntry" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankEntry_patientId_idx" ON "BankEntry"("patientId");

-- CreateIndex
CREATE INDEX "BankEntry_entryDate_idx" ON "BankEntry"("entryDate");

-- AddForeignKey
ALTER TABLE "BankEntry" ADD CONSTRAINT "BankEntry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
