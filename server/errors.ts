export class ServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}
export function publicFailure(error: unknown): ServiceError {
  return error instanceof ServiceError
    ? error
    : new ServiceError(
        "operation-failed",
        "The operation failed. Try a bounded retry or paste confirmed facts and upload owned images.",
        502,
      );
}
