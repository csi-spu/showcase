import { clampReviewPage, toReviewSearch } from './collection-review-queue';

const hash = (value: string) => `hash:${value}`;

describe('toReviewSearch', () => {
  it('ignores an empty or blank term', () => {
    expect(toReviewSearch(null, hash)).toBeNull();
    expect(toReviewSearch('   ', hash)).toBeNull();
  });

  it('searches a Student ID prefix through its hash, never the raw value', () => {
    expect(toReviewSearch(' 6600 ', hash)).toEqual({
      kind: 'student_id_prefix',
      prefixHash: 'hash:6600',
      prefixLength: 4,
    });
  });

  it('searches anything else by Roster name with whitespace collapsed', () => {
    expect(toReviewSearch('  สมชาย   ใจดี ', hash)).toEqual({ kind: 'name', name: 'สมชาย ใจดี' });
    expect(toReviewSearch('660000001', hash)).toEqual({ kind: 'name', name: '660000001' });
  });
});

describe('clampReviewPage', () => {
  it('keeps a page that exists', () => {
    expect(clampReviewPage(2, 10, 11)).toBe(2);
  });

  it('moves a page past the end back to the last page', () => {
    expect(clampReviewPage(9, 10, 25)).toBe(3);
  });

  it('keeps page 1 for an empty list', () => {
    expect(clampReviewPage(4, 10, 0)).toBe(1);
  });
});
