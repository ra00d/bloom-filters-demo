/**
 * Returns the elapsed time in microseconds, rounded to two decimal places.
 */
export function elapsedMicros(startedAt: bigint): number {
  return Math.round(Number(process.hrtime.bigint() - startedAt) / 10) / 100;
}
