/** Waits so a typing indicator can paint before the reply arrives.
 *
 * @param ms - Delay in milliseconds.
 * @returns A promise that resolves after the delay.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
