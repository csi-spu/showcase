import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import RootLayout from './layout';

vi.mock('next/font/google', () => ({
  IBM_Plex_Sans_Thai: () => ({ variable: 'font-showcase-sans' }),
}));

vi.mock('next-intl', () => ({
  NextIntlClientProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('next-intl/server', () => ({
  getLocale: async () => 'th',
  getMessages: async () => ({}),
  getTranslations: async () => (key: string) => key,
}));

vi.mock('./web-vitals-reporter', () => ({
  WebVitalsReporter: () => null,
}));

describe('RootLayout', () => {
  it('declares smooth scrolling so Next.js can manage route transitions', async () => {
    const html = renderToStaticMarkup(await RootLayout({ children: <main>Showcase</main> }));

    expect(html).toContain('data-scroll-behavior="smooth"');
  });
});
