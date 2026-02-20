/**
 * Timeout wrapper for promises. Rejects with TimeoutError if the promise
 * does not settle within the given milliseconds.
 */

export class TimeoutError extends Error {
  constructor(
    message: string,
    public readonly label?: string,
    public readonly timeoutMs?: number
  ) {
    super(message);
    this.name = 'TimeoutError';
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * Wraps a promise with a timeout. If the promise resolves or rejects before
 * the timeout, that result is returned. Otherwise rejects with TimeoutError.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label?: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(`Timeout after ${ms}ms`, label, ms));
    }, ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}
