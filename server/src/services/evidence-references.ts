import type { IEvidenceReference } from '../models/PerformanceReview.js';

export function resolveEvidenceReferences(
  references: unknown,
  evidenceCatalog: IEvidenceReference[]
): IEvidenceReference[] {
  if (!Array.isArray(references)) return [];

  const catalogById = new Map(evidenceCatalog.map((reference) => [reference.id, reference]));
  const resolved: IEvidenceReference[] = [];

  for (const reference of references) {
    const id =
      typeof reference === 'string'
        ? reference
        : typeof reference === 'object' &&
            reference !== null &&
            'id' in reference &&
            typeof reference.id === 'string'
          ? reference.id
          : undefined;
    const canonicalReference = id ? catalogById.get(id) : undefined;

    if (canonicalReference) resolved.push(canonicalReference);
  }

  return resolved;
}
