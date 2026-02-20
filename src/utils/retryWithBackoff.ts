/**
 * Retries an async function with backoff delays between attempts.
 * @param fn Function that returns a Promise (will be called on each attempt)
 * @param attempts Maximum number of attempts (including the first call)
 * @param delaysMs Delays in ms before retry after failure (delaysMs[0] before 2nd attempt, etc.)
 * @param label Optional label for logging
 * @returns The result of the first successful fn() call
 */

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  attempts: number,
  delaysMs: number[],
  label?: string
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const result = await fn();
      if (__DEV__ && label && attempt > 0) {
        console.log(`[retryWithBackoff] ${label} succeeded on attempt ${attempt + 1}`);
      }
      return result;
    } catch (err) {
      lastError = err;
      if (__DEV__ && label) {
        console.warn(`[retryWithBackoff] ${label} attempt ${attempt + 1} failed`, err);
      }
      if (attempt < attempts - 1 && delaysMs[attempt] != null) {
        await new Promise((r) => setTimeout(r, delaysMs[attempt]));
      }
    }
  }
  throw lastError;
}
