import Link from 'next/link';
import type { ReactNode } from 'react';

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto min-h-svh w-full max-w-[1440px] bg-background">
      <header className="border-b border-border px-[clamp(1rem,4vw,3rem)] py-6">
        <nav aria-label="เมนูสาธารณะ" className="flex flex-wrap items-center justify-between gap-4">
          <Link className="font-semibold tracking-[0.12em]" href="/">
            STUDENT SHOWCASE
          </Link>
          <ul className="flex list-none gap-6 p-0 text-sm font-medium">
            <li>
              <Link
                className="focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                href="/works"
              >
                ผลงาน
              </Link>
            </li>
            <li>
              <Link
                className="focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                href="/people"
              >
                ผู้สร้าง
              </Link>
            </li>
          </ul>
        </nav>
      </header>
      {children}
    </main>
  );
}
