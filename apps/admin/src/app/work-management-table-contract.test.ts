import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Admin Work Management list surfaces', () => {
  it.each(['reviews/page.tsx', 'recovery/page.tsx', 'corrections/page.tsx'])(
    'uses the shared semantic operational table in %s',
    async (relativePath) => {
      const source = await readFile(resolve(process.cwd(), 'src/app', relativePath), 'utf8');
      expect(source).toContain("from '@/components/ui/table'");
      expect(source).toContain('<Table aria-label=');
    },
  );
});
