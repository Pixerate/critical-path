/**
 * Thrown when input fails a domain rule. Route handlers map it to HTTP 400.
 */
export interface ValidationIssue {
  /** Dot-separated path to the invalid field, e.g. `todos.0.title`. Empty for the whole payload. */
  path: string;
  message: string;
}

export class ValidationError extends Error {
  public readonly issues?: ValidationIssue[];

  constructor(message: string, issues?: ValidationIssue[]) {
    super(message);
    this.name = 'ValidationError';
    this.issues = issues;
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

/**
 * Thrown when the actor is not allowed to perform an action. Route handlers map it to HTTP 403.
 */
export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}
