/**
 * Thrown when input fails a domain rule. Route handlers map it to HTTP 400.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Thrown when a referenced entity does not exist. Route handlers map it to HTTP 404.
 */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}
