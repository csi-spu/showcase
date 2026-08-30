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

  it('does not force the Student surface wider than the mobile viewport', async () => {
    const globals = await readFile(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');

    expect(globals).not.toMatch(/body\s*{[^}]*min-width/);
  });

  it('uses the official CSI and SIT brand assets', async () => {
    const brand = await readFile(resolve(process.cwd(), 'src/app/student-brand.tsx'), 'utf8');
    const csiAsset = await readFile(
      resolve(
        process.cwd(),
        'public/brand/csi-computer-science-software-development-innovation.png',
      ),
    );
    const sitAsset = await readFile(
      resolve(process.cwd(), 'public/brand/sit-school-of-information-technology-color.webp'),
    );

    expect(brand).toContain('csi-computer-science-software-development-innovation.png');
    expect(brand).toContain('sit-school-of-information-technology-color.webp');
    expect(csiAsset.byteLength).toBeGreaterThan(0);
    expect(sitAsset.byteLength).toBeGreaterThan(0);
  });

  it('gives the create Work flow the full workspace width', async () => {
    const page = await readFile(resolve(process.cwd(), 'src/app/works/new/page.tsx'), 'utf8');
    const form = await readFile(resolve(process.cwd(), 'src/app/works/work-form.tsx'), 'utf8');

    expect(page).not.toContain('<WorkspacePage');
    expect(page).not.toContain("t('createDescription')");
    expect(form).not.toContain('lg:grid-cols-[15rem_minmax(0,1fr)]');
    expect(form).toContain('sm:grid-cols-5');
  });

  it('gives Work details the same full-width authoring layout', async () => {
    const page = await readFile(
      resolve(process.cwd(), 'src/app/works/[publicId]/page.tsx'),
      'utf8',
    );
    const workspacePage = await readFile(
      resolve(process.cwd(), 'src/app/workspace-page.tsx'),
      'utf8',
    );

    expect(page).toContain('layout="authoring"');
    expect(workspacePage).toContain("layout = 'overview'");
    expect(workspacePage).toContain("layout === 'authoring'");
  });

  it('gives the owned Work list the same full-width workspace convention', async () => {
    const page = await readFile(resolve(process.cwd(), 'src/app/works/page.tsx'), 'utf8');

    expect(page).toContain('layout="authoring"');
  });

  it('uses the large profile photo for photo editing and identity for bio editing', async () => {
    const page = await readFile(resolve(process.cwd(), 'src/app/profile/page.tsx'), 'utf8');
    const profileForm = await readFile(
      resolve(process.cwd(), 'src/app/profile/profile-form.tsx'),
      'utf8',
    );
    const globals = await readFile(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');

    expect(page).not.toContain('<nav');
    expect(page).not.toContain('profile-cover');
    expect(globals).not.toContain('.profile-cover');
    expect(page).toContain('ProfileOverviewEditLink');
    expect(page).toContain('<ProfilePhotoButton');
    expect(profileForm).toContain('href="#profile-bio"');
    expect(page).not.toContain('PencilIcon');
  });
});
