import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Admin authentication boundary', () => {
  it('routes browser mutations through Server Actions and never browser fetch', async () => {
    const [actions, forms] = await Promise.all([
      readFile(resolve(process.cwd(), 'src/app/admin-auth.actions.ts'), 'utf8'),
      readFile(resolve(process.cwd(), 'src/app/admin-auth-forms.tsx'), 'utf8'),
    ]);
    expect(actions.startsWith("'use server';")).toBe(true);
    expect(forms).toContain('<form action={formAction}');
    expect(forms).not.toMatch(/\bfetch\s*\(/);
    expect(forms).not.toContain('CORE_URL');
    expect(forms).not.toContain('API_KEY');
  });

  it('uses the shared typography, bounded canvas, and CSI workspace identity', async () => {
    const [frame, layout, page] = await Promise.all([
      readFile(resolve(process.cwd(), 'src/app/admin-workspace-frame.tsx'), 'utf8'),
      readFile(resolve(process.cwd(), 'src/app/layout.tsx'), 'utf8'),
      readFile(resolve(process.cwd(), 'src/app/page.tsx'), 'utf8'),
    ]);
    expect(layout).toContain('IBM_Plex_Sans_Thai');
    expect(layout).toContain("weight: ['400', '500', '600']");
    expect(frame).toContain("'lg:grid-cols-[16rem_minmax(0,1fr)]'");
    expect(frame).toContain('max-w-[1600px]');
    expect(frame).toContain('<AdminBrandMark />');
    expect(page).toContain('<AdminAuthLayout');
    expect(page).not.toContain(' bg-primary ');
  });
});
