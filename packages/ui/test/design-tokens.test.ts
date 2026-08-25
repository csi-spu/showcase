import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const stylesPath = resolve(process.cwd(), 'src/styles.css');

describe('shared visual design tokens', () => {
  it('implements the confirmed light palette from DESIGN.md', async () => {
    const styles = await readFile(stylesPath, 'utf8');

    expect(styles).toContain('--background: #f7f7f5;');
    expect(styles).toContain('--foreground: #161616;');
    expect(styles).toContain('--card: #ffffff;');
    expect(styles).toContain('--muted-foreground: #62605f;');
    expect(styles).toContain('--border: #d8d5d2;');
    expect(styles).toContain('--input: #8a8582;');
    expect(styles).toContain('--primary: #91007b;');
    expect(styles).toContain('--primary-soft: #f8edf6;');
    expect(styles).toContain('--disabled: #e9e7e4;');
    expect(styles).toContain('--disabled-foreground: #686462;');
    expect(styles).toContain('--ring: #91007b;');
    expect(styles).toContain('--success: #176b4d;');
    expect(styles).toContain('--success-background: #eaf6f0;');
    expect(styles).toContain('--warning: #7a4a00;');
    expect(styles).toContain('--warning-background: #fff4d6;');
    expect(styles).toContain('--destructive: #b42318;');
    expect(styles).toContain('--destructive-background: #fdecea;');
    expect(styles).toContain('--information: #1d4f91;');
    expect(styles).toContain('--information-background: #eaf2ff;');
    expect(styles).not.toContain('.dark {');
  });

  it('exposes the confirmed typography and shape roles', async () => {
    const styles = await readFile(stylesPath, 'utf8');

    expect(styles).toMatch(/--font-sans:\s*var\(\s*--font-showcase-sans/);
    expect(styles).toContain('--radius-control: 0.5rem;');
    expect(styles).toContain('--radius-surface: 0.75rem;');
  });
});
