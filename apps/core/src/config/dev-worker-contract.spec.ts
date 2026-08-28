import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('development worker orchestration', () => {
  it('runs the Work media processor beside the Core development server', () => {
    const corePackage = readJson<ProjectPackage>(resolve(__dirname, '../../package.json'));
    const coreTurbo = readJson<TurboConfig>(resolve(__dirname, '../../turbo.json'));
    const rootTurbo = readJson<TurboConfig>(resolve(__dirname, '../../../../turbo.json'));

    expect(corePackage.scripts?.['media:dev']).toBe(
      'node --watch -r ts-node/register -r tsconfig-paths/register src/modules/works/commands/process-work-media-development.ts',
    );
    expect(coreTurbo.tasks?.dev?.with).toContain('@showcase/core#media:dev');
    expect(rootTurbo.tasks?.['media:dev']).toMatchObject({ cache: false, persistent: true });
  });
});

interface ProjectPackage {
  scripts?: Record<string, string>;
}

interface TurboConfig {
  tasks?: Record<string, { cache?: boolean; persistent?: boolean; with?: string[] }>;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}
