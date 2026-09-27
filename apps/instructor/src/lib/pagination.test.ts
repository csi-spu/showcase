import { describe, expect, it } from 'vitest';
import { clampPage, pageItems } from './pagination';

describe('pageItems', () => {
  it('keeps the ends and neighbours and marks each skipped run once', () => {
    expect(pageItems(5, 9)).toEqual([1, 'gap', 4, 5, 6, 'gap', 9]);
    expect(pageItems(1, 3)).toEqual([1, 2, 3]);
  });
});

describe('clampPage', () => {
  it('keeps a page within the pages that exist', () => {
    expect(clampPage(0, 3)).toBe(1);
    expect(clampPage(7, 3)).toBe(3);
    expect(clampPage(2.6, 3)).toBe(2);
  });
});
