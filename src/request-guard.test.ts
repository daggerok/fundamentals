import { expect, test } from 'bun:test';
import { latestOnly } from './request-guard';

test('a slower earlier search is stale once a newer one begins', async () => {
  const guard = latestOnly();
  const shown: string[] = [];
  const search = async (sym: string, delay: number) => {
    const current = guard.begin();
    await new Promise((resolve) => setTimeout(resolve, delay));
    if (current()) shown.push(sym);
  };
  // AAPL answers last but was asked first: only MSFT may be shown.
  await Promise.all([search('AAPL', 20), search('MSFT', 1)]);
  expect(shown).toEqual(['MSFT']);
});

test('cancel makes the running search stale', () => {
  const guard = latestOnly();
  const current = guard.begin();
  expect(current()).toBe(true);
  guard.cancel();
  expect(current()).toBe(false);
});
