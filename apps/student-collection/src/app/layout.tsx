import { Toaster } from '@showcase/ui/toast';
import type { Metadata } from 'next';
import { IBM_Plex_Sans_Thai } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { Suspense, type ReactNode } from 'react';
import { PasswordSetToast } from './password-set-toast';
import './globals.css';

const ibmPlexSansThai = IBM_Plex_Sans_Thai({
  display: 'swap',
  subsets: ['latin', 'thai'],
  variable: '--font-showcase-sans',
  weight: ['400', '500', '600'],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Metadata');

  return { description: t('description'), title: t('title') };
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);

  return (
    <html className={ibmPlexSansThai.variable} lang={locale}>
      <body className="font-sans antialiased">
        <NextIntlClientProvider messages={messages}>
          {children}
          {/* Reads search params, so a statically prerendered page renders it on the client. */}
          <Suspense fallback={null}>
            <PasswordSetToast />
          </Suspense>
        </NextIntlClientProvider>
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
