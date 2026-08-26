'use client';

import { useReportWebVitals } from 'next/web-vitals';

const CORE_WEB_VITALS = new Set(['CLS', 'INP', 'LCP']);

export function WebVitalsReporter() {
  useReportWebVitals(reportWebVital);
  return null;
}

function reportWebVital(metric: { id: string; name: string; rating: string; value: number }): void {
  if (!CORE_WEB_VITALS.has(metric.name) || !isSampled(metric.id)) return;
  const payload = {
    device: window.matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop',
    name: metric.name,
    page: publicPageGroup(window.location.pathname),
    rating: metric.rating,
    value: metric.value,
  };
  void fetch('/api/metrics/web-vitals', {
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
    keepalive: true,
    method: 'POST',
  }).catch(() => undefined);
}

function isSampled(metricId: string): boolean {
  let hash = 0;
  for (const character of metricId) hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  return hash % 100 === 0;
}

function publicPageGroup(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return 'home';
  if (segments[0] === 'works') return segments.length === 1 ? 'works' : 'work_detail';
  if (segments[0] === 'people') return segments.length === 1 ? 'people' : 'people_detail';
  if (segments[0] === 'tags') return 'tag_detail';
  return 'other';
}
