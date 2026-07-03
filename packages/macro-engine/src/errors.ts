/**
 * A macro run failure that names the EXACT failing step + reason — the deliberate opposite of
 * iMacros' opaque numeric error codes (`-910`, `-921`, `8011`). `stepPath` is the index trail through
 * nested `if`/`repeat`/`forEachRow` bodies (e.g. `[3, 1]` = 2nd child of the 4th top-level step).
 */
export class MacroError extends Error {
  constructor(
    message: string,
    readonly stepPath: readonly number[],
    readonly stepKind: string,
  ) {
    super(message);
    this.name = 'MacroError';
  }

  /** Human-readable location, e.g. "step 4.2 (click)". */
  get where(): string {
    const loc = this.stepPath.map((i) => i + 1).join('.');
    return `step ${loc} (${this.stepKind})`;
  }
}

/** Raised when a run is cancelled via the abort signal (not a failure — a clean stop). */
export class MacroAborted extends Error {
  constructor() {
    super('Macro run aborted');
    this.name = 'MacroAborted';
  }
}
