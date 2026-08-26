import { createHash } from 'node:crypto';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function publicCacheTags(pathname: string): string[] {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return ['showcase-catalog', 'showcase-catalog-works'];
  if (segments[0] === 'sitemap.xml' || segments[0] === 'sitemaps') return ['showcase-sitemap'];
  if (segments[0] === 'works') {
    const tags = ['showcase-catalog', 'showcase-catalog-works'];
    if (segments[1] !== undefined && UUID_PATTERN.test(segments[1])) {
      tags.push(`showcase-work-${segments[1]}`);
    }
    if (segments[2] === 'media' && segments[3] !== undefined && UUID_PATTERN.test(segments[3])) {
      tags.push(`showcase-media-${segments[3]}`);
    }
    return tags;
  }
  if (segments[0] === 'people') {
    const tags = ['showcase-catalog', 'showcase-catalog-people'];
    if (segments[1] !== undefined && UUID_PATTERN.test(segments[1])) {
      tags.push(`showcase-profile-${segments[1]}`);
    }
    return tags;
  }
  if (segments[0] === 'tags') {
    const tags = ['showcase-catalog', 'showcase-catalog-tags'];
    if (segments[1] !== undefined && UUID_PATTERN.test(segments[1])) {
      tags.push(`showcase-tag-${segments[1]}`);
    }
    return tags;
  }
  return [];
}

export function isPublicHtmlSharedCacheEligible(url: URL): boolean {
  const segments = url.pathname.split('/').filter(Boolean);
  const entityId = segments[1];
  if (segments.length === 0) return url.search.length === 0;
  if (segments[0] === 'works' && segments.length === 1) {
    return (
      !url.searchParams.has('cursor') &&
      !url.searchParams.has('q') &&
      url.searchParams.getAll('tag').filter(Boolean).length <= 1
    );
  }
  if (segments[0] === 'people' && segments.length === 1) {
    return !url.searchParams.has('cursor') && !url.searchParams.has('q');
  }
  if (segments[0] === 'tags' && segments.length === 2 && entityId !== undefined) {
    if (!UUID_PATTERN.test(entityId)) return false;
    return !url.searchParams.has('cursor');
  }
  return (
    segments.length === 2 &&
    (segments[0] === 'works' || segments[0] === 'people') &&
    entityId !== undefined &&
    UUID_PATTERN.test(entityId)
  );
}

export function publicHtmlEtag(url: URL, version: string): string {
  const identity = `${url.pathname}${url.search}\0${version}`;
  return `W/"${createHash('sha256').update(identity).digest('base64url')}"`;
}

export function matchesIfNoneMatch(header: string | null, etag: string): boolean {
  if (header === null) return false;
  return header
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === '*' || value === etag);
}
