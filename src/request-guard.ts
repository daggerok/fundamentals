/**
 * Only the newest request may write state: `begin()` returns a check that turns false as soon
 * as a newer request begins or `cancel()` runs, so a slower earlier search cannot overwrite
 * the result of a later one.
 */
export function latestOnly() {
  let latest = 0;
  return {
    begin(): () => boolean {
      const id = ++latest;
      return () => id === latest;
    },
    cancel() {
      latest++;
    },
  };
}
