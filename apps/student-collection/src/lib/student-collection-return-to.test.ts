import { describe, expect, it } from 'vitest';
import { parseStudentCollectionReturnTo } from './student-collection-return-to';

describe('parseStudentCollectionReturnTo', () => {
  it('accepts a same-app relative path', () => {
    expect(parseStudentCollectionReturnTo('/history/abc-123')).toBe('/history/abc-123');
  });

  it('rejects an absent value', () => {
    expect(parseStudentCollectionReturnTo(undefined)).toBeNull();
  });

  it('rejects a path that does not start with a single slash', () => {
    expect(parseStudentCollectionReturnTo('history/abc-123')).toBeNull();
  });

  it('rejects a protocol-relative URL, which browsers resolve to another origin', () => {
    expect(parseStudentCollectionReturnTo('//evil.example.com')).toBeNull();
  });

  it('rejects a backslash-based URL, which browsers normalize to another origin', () => {
    expect(parseStudentCollectionReturnTo('/\\evil.example.com')).toBeNull();
  });

  it('rejects an absolute URL to another origin', () => {
    expect(parseStudentCollectionReturnTo('https://evil.example.com')).toBeNull();
  });
});
