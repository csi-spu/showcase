import { describe, expect, it } from 'vitest';
import { getPaginationItems } from './work-pagination';

describe('getPaginationItems', () => {
  it('shows every short page range and compacts long ranges around the current page', () => {
    expect(getPaginationItems(2, 4)).toEqual([1, 2, 3, 4]);
    expect(getPaginationItems(5, 10)).toEqual([1, 'ellipsis-1', 4, 5, 6, 'ellipsis-6', 10]);
  });
});
