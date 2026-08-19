/**
 * Deterministic JSON serialization for hashing (Phase 7 NotaryService).
 *
 * `JSON.stringify` is not a hash-safe encoding: object key order follows insertion order, so the same
 * logical event can serialize two different ways depending on how it was constructed. A hash chain built
 * on that would flag a perfectly intact record as tampered the moment a payload was rebuilt with its
 * keys in a different order — which is worse than useless, because it teaches people to distrust the
 * chain instead of the record.
 *
 * This sorts object keys recursively and leaves array order untouched (array order is meaningful data,
 * not an artifact of construction). `undefined` values are dropped rather than serialized as `null`, so
 * `{a: undefined}` and `{}` hash identically — the same rule `JSON.stringify` already applies to object
 * properties, made explicit here because a hash function must never depend on an accident of the engine.
 */
export function canonicalJson(value: unknown): string {
  return stringify(value);
}

function stringify(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'null'; // only reached at the top level or inside an array
  const t = typeof value;
  if (t === 'string') return JSON.stringify(value);
  if (t === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('canonicalJson: cannot hash a non-finite number');
    }
    return JSON.stringify(value);
  }
  if (t === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => stringify(v === undefined ? null : v)).join(',')}]`;
  }
  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    const parts = keys.map((k) => `${JSON.stringify(k)}:${stringify(obj[k])}`);
    return `{${parts.join(',')}}`;
  }
  throw new Error(`canonicalJson: cannot hash a value of type ${t}`);
}
