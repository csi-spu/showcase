'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="th">
      <body>
        <main className="grid min-h-svh place-items-center p-6">
          <section className="grid max-w-xl gap-4 rounded-surface border border-border bg-card p-8">
            <h1 className="text-2xl font-semibold">เกิดข้อผิดพลาด</h1>
            <p>ระบบไม่สามารถแสดงหน้านี้ได้ กรุณาลองใหม่อีกครั้ง</p>
            <button onClick={reset} type="button">
              ลองอีกครั้ง
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
