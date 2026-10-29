import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Static AISHE institution directory.
 *
 * The dataset is a snapshot of the AISHE institutions list (70,011 unique
 * codes) stored as compact tuples: [aisheCode, name, state, district].
 * It is a lookup table only — nothing here is written back to the file.
 */
export interface InstitutionRecord {
  aisheCode: string;
  name: string;
  state: string;
  district: string;
}

type Row = [string, string, string, string];

let byCode: Map<string, InstitutionRecord> | null = null;
let searchIndex: { haystack: string; record: InstitutionRecord }[] | null = null;

/**
 * The file lives at apps/api/assets/aishe.json. In development this module runs
 * from src/data/, after bundling from dist/, so a few candidates are tried
 * instead of relying on the process working directory.
 */
function resolveDatasetPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../../assets/aishe.json'), // bundled: dist/index.js
    path.resolve(here, '../assets/aishe.json'), // dev: src/data/aishe.ts
    path.resolve(process.cwd(), 'apps/api/assets/aishe.json'),
    path.resolve(process.cwd(), 'assets/aishe.json'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `The AISHE institution dataset could not be found. Expected it at apps/api/assets/aishe.json. Tried:\n${candidates.join('\n')}`,
  );
}

function load(): Map<string, InstitutionRecord> {
  if (byCode) return byCode;
  const raw = JSON.parse(readFileSync(resolveDatasetPath(), 'utf8')) as Row[];
  const map = new Map<string, InstitutionRecord>();
  for (const row of raw) {
    const [aisheCode, name, state, district] = row;
    map.set(aisheCode, { aisheCode, name, state, district });
  }
  byCode = map;
  return map;
}

/**
 * Accepts the code as printed on AISHE documents and tolerates the formats
 * people actually type: lower case, missing hyphen, or spaces around it.
 * "u0456", " U-0456 " and "U-0456" all resolve to "U-0456".
 */
export function normalizeAisheCode(input: string): string {
  const cleaned = input.trim().toUpperCase().replace(/\s+/g, '');
  const withoutHyphen = cleaned.replace(/-/g, '');
  const match = /^([A-Z])(\d+)$/.exec(withoutHyphen);
  if (!match) return cleaned;
  return `${match[1]}-${match[2]}`;
}

export function findInstitution(input: string): InstitutionRecord | null {
  if (!input) return null;
  return load().get(normalizeAisheCode(input)) ?? null;
}

export function institutionCount(): number {
  return load().size;
}

/** Partial, case-insensitive search used by the registration form hint. */
export function searchInstitutions(query: string, limit = 8): InstitutionRecord[] {
  const term = query.trim().toLowerCase();
  if (term.length < 3) return [];

  if (!searchIndex) {
    searchIndex = [...load().values()].map((record) => ({
      record,
      haystack: `${record.name} ${record.state} ${record.district}`.toLowerCase(),
    }));
  }

  const results: InstitutionRecord[] = [];
  for (const entry of searchIndex) {
    if (entry.haystack.includes(term)) {
      results.push(entry.record);
      if (results.length >= limit) break;
    }
  }
  return results;
}
