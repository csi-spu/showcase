import { describe, expect, it } from 'vitest';
import { isQuickSearchQueryReady } from './quick-search-state';

describe('quick search presentation state', () => {
  it.each([
    ['', false],
    ['ก', false],
    ['  ก  ', false],
    ['กา', true],
    ['  portfolio  ', true],
  ] as const)('shows the result panel only after a query is ready', (query, expected) => {
    expect(isQuickSearchQueryReady(query)).toBe(expected);
  });
});
