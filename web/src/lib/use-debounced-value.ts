import debounce from 'lodash/debounce'
import { useEffect, useState } from 'react'

/**
 * Returns a copy of `value` that updates after the user pauses.
 *
 * @param value - The live value, usually an input.
 * @param wait - Quiet period in milliseconds.
 * @returns The debounced value.
 */
export function useDebouncedValue(value: string, wait: number): string {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const update = debounce(() => setDebounced(value), wait)
    update()
    return () => {
      update.cancel()
    }
  }, [value, wait])

  return debounced
}
