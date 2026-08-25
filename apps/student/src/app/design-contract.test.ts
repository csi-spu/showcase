import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Student visual contract', () => {
  it('loads the DESIGN.md typeface and approved weights', async () => {
    const layout = await readFile(resolve(process.cwd(), 'src/app/layout.tsx'), 'utf8');

    expect(layout).toContain('IBM_Plex_Sans_Thai');
    expect(layout).toContain("weight: ['400', '500', '600']");
    expect(layout).toContain("variable: '--font-showcase-sans'");
    expect(layout).not.toContain('Noto_Sans_Thai');
  });

  it('does not use Primary as the large auth background', async () => {
    const page = await readFile(resolve(process.cwd(), 'src/app/page.tsx'), 'utf8');

    expect(page).not.toMatch(/<aside className="[^"]*\bbg-primary\b/);
    expect(page).toMatch(/<aside className="[^"]*\bbg-background\b/);
  });
});
