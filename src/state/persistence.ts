/** Saving, loading, importing, and sharing deals. */
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { storage } from '../lib/platform';
import { SCHEMA_VERSION, type Deal } from './deal';
import { blankDeal } from './samples';

const STORAGE_KEY = 'proforma.deal.v1';
const SHARE_PREFIX = 'd=';

export class DealFormatError extends Error {}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/**
 * Accept a deal from JSON. Missing sections are filled from a blank deal so
 * files saved by older versions still open.
 */
export function parseDeal(json: string): Deal {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new DealFormatError('That file is not valid JSON.');
  }
  if (
    !isObject(raw) ||
    !isObject(raw.company) ||
    !Array.isArray(raw.events) ||
    !isObject(raw.formation)
  ) {
    throw new DealFormatError(
      'That JSON is not a Proforma deal. Export a deal from Proforma and try again.',
    );
  }
  if (typeof raw.schema === 'number' && raw.schema > SCHEMA_VERSION) {
    throw new DealFormatError('This deal was saved by a newer version of Proforma.');
  }
  const base = blankDeal();
  const merged = { ...base, ...raw } as Deal;
  merged.company = { ...base.company, ...(raw.company as object) } as Deal['company'];
  merged.metrics = {
    ...base.metrics,
    ...(isObject(raw.metrics) ? raw.metrics : {}),
  } as Deal['metrics'];
  merged.exit = { ...base.exit, ...(isObject(raw.exit) ? raw.exit : {}) } as Deal['exit'];
  merged.fund = { ...base.fund, ...(isObject(raw.fund) ? raw.fund : {}) } as Deal['fund'];
  merged.memo = { ...base.memo, ...(isObject(raw.memo) ? raw.memo : {}) } as Deal['memo'];
  merged.schema = SCHEMA_VERSION;
  return merged;
}

export function serializeDeal(deal: Deal): string {
  return JSON.stringify(deal, null, 2);
}

export function loadSaved(): Deal | null {
  const text = storage.get(STORAGE_KEY);
  if (!text) return null;
  try {
    return parseDeal(text);
  } catch {
    return null;
  }
}

export function save(deal: Deal): void {
  storage.set(STORAGE_KEY, JSON.stringify(deal));
}

export function shareHash(deal: Deal): string {
  return `#${SHARE_PREFIX}${compressToEncodedURIComponent(JSON.stringify(deal))}`;
}

export function dealFromHash(hash: string): Deal | null {
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!h.startsWith(SHARE_PREFIX)) return null;
  const json = decompressFromEncodedURIComponent(h.slice(SHARE_PREFIX.length));
  if (!json) return null;
  try {
    return parseDeal(json);
  } catch {
    return null;
  }
}

export function fileName(deal: Deal): string {
  const slug =
    deal.company.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'deal';
  return `${slug}.proforma.json`;
}
