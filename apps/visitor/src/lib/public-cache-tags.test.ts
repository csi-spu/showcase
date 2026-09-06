import { describe, expect, it } from 'vitest';
import {
  isPublicHtmlSharedCacheEligible,
  matchesIfNoneMatch,
  publicCacheTags,
  publicHtmlDeploymentVersion,
  publicHtmlEtag,
} from './public-cache-tags';

describe('publicCacheTags', () => {
  it('binds collection and entity cache tags to stable public routes', () => {
    expect(publicCacheTags(`/works/${id(1)}/media/${id(2)}/480`)).toEqual([
      'showcase-catalog',
      'showcase-catalog-works',
      `showcase-work-${id(1)}`,
      `showcase-media-${id(2)}`,
    ]);
    expect(publicCacheTags(`/people/${id(3)}`)).toContain(`showcase-profile-${id(3)}`);
    expect(publicCacheTags(`/tags/${id(4)}`)).toContain(`showcase-tag-${id(4)}`);
  });

  it('does not tag internal or unrelated routes', () => {
    expect(publicCacheTags('/api/internal/cache/revalidate')).toEqual([]);
    expect(publicCacheTags('/health')).toEqual([]);
  });

  it('allows only bounded non-search first-page HTML in shared cache', () => {
    expect(isPublicHtmlSharedCacheEligible(url('/works?category=course_work'))).toBe(true);
    expect(isPublicHtmlSharedCacheEligible(url(`/works?tag=${id(1)}`))).toBe(true);
    expect(isPublicHtmlSharedCacheEligible(url(`/works?tag=${id(1)}&tag=${id(2)}`))).toBe(false);
    expect(isPublicHtmlSharedCacheEligible(url('/works?q=react'))).toBe(false);
    expect(isPublicHtmlSharedCacheEligible(url('/works?page=2'))).toBe(true);
    expect(isPublicHtmlSharedCacheEligible(url('/people?q=react'))).toBe(false);
    expect(isPublicHtmlSharedCacheEligible(url(`/tags/${id(1)}?page=2`))).toBe(true);
  });

  it('changes validators with the authoritative cache version and matches HTTP lists', () => {
    const first = publicHtmlEtag(url('/works?sort=recent'), '41', 'deploy-a');
    const second = publicHtmlEtag(url('/works?sort=recent'), '42', 'deploy-a');
    expect(second).not.toBe(first);
    expect(matchesIfNoneMatch(`"other", ${second}`, second)).toBe(true);
    expect(matchesIfNoneMatch(first, second)).toBe(false);
  });

  it('changes validators when a new frontend deployment serves the same catalog version', () => {
    const previousDeployment = publicHtmlEtag(url('/'), '41', 'deploy-a');
    const currentDeployment = publicHtmlEtag(url('/'), '41', 'deploy-b');

    expect(currentDeployment).not.toBe(previousDeployment);
  });

  it('enables shared HTML validators only for identified production deployments', () => {
    expect(publicHtmlDeploymentVersion('development', 'local-sha')).toBeNull();
    expect(publicHtmlDeploymentVersion('production', undefined)).toBeNull();
    expect(publicHtmlDeploymentVersion('production', '  ')).toBeNull();
    expect(publicHtmlDeploymentVersion('production', 'development')).toBeNull();
    expect(publicHtmlDeploymentVersion('production', 'sha-abc123')).toBe('sha-abc123');
  });
});

function id(index: number): string {
  return `9f000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function url(path: string): URL {
  return new URL(path, 'https://showcase.example.test');
}
