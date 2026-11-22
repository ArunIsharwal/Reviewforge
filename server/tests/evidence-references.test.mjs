import assert from 'node:assert/strict';
import { resolveEvidenceReferences } from '../dist/services/evidence-references.js';

const catalog = [
  {
    id: 'ev-okr-1',
    sourceType: 'OKR',
    sourceId: 'okr-1',
    sourceTitle: 'Quarterly OKR',
    sourceDate: 'Q1 2026',
    excerpt: 'Completed key result',
  },
  {
    id: 'ev-note-1',
    sourceType: 'ManagerObservation',
    sourceId: 'note-1',
    sourceTitle: 'Manager observation',
    sourceDate: '2026-01-01',
    excerpt: 'Coached teammate',
  },
];

assert.deepEqual(
  resolveEvidenceReferences(['ev-okr-1', { id: 'ev-note-1', excerpt: 'untrusted model text' }, 'unknown'], catalog),
  catalog
);
assert.deepEqual(resolveEvidenceReferences(['unknown'], catalog), []);
assert.deepEqual(resolveEvidenceReferences(null, catalog), []);

console.log('Evidence reference normalization tests passed.');
