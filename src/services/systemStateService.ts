// src/services/systemStateService.ts
import { PrismaClient, SystemState } from '@prisma/client';

const prisma = new PrismaClient();

export async function getOrCreateSystemState(): Promise<SystemState> {
  let state = await prisma.systemState.findFirst();
  if (!state) {
    state = await prisma.systemState.create({ data: {} });
  }
  return state;
}

export async function getForcedLogoutAt(): Promise<Date | null> {
  const state = await getOrCreateSystemState();
  return state.forcedLogoutAt;
}

export async function setForcedLogoutAt(date: Date): Promise<SystemState> {
  const state = await getOrCreateSystemState();
  return prisma.systemState.update({
    where: { id: state.id },
    data: { forcedLogoutAt: date }
  });
}
