/**
 * AppError contract (internal-ai-rules): services THROW AppError; a single boundary
 * (IPC handler / tool-call / MCP) catches and maps to { message, statusCode }.
 * Status codes keep HTTP semantics even though there is no HTTP route in Electron.
 */
export class AppError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}

export interface BoundaryResult {
  message: string;
  statusCode: number;
}

/** Map any thrown value to a structured boundary result (unknown → 500). */
export function toBoundary(err: unknown): BoundaryResult {
  if (err instanceof AppError) {
    return { message: err.message, statusCode: err.statusCode };
  }
  return { message: 'Internal error', statusCode: 500 };
}
