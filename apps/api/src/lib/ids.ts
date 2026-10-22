import { randomUUID } from 'node:crypto';

export const newId = (prefix: string): string => `${prefix}_${randomUUID()}`;

export const nowIso = (): string => new Date().toISOString();

export const normalizeSkillKey = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ');
