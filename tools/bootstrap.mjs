import { copyFile, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..');

const environmentFiles = [
  ['apps/core/.env.example', 'apps/core/.env'],
  ['apps/admin/.env.example', 'apps/admin/.env.local'],
  ['apps/student/.env.example', 'apps/student/.env.local'],
  ['apps/visitor/.env.example', 'apps/visitor/.env.local'],
];

for (const [source, destination] of environmentFiles) {
  const sourcePath = path.join(repositoryRoot, source);
  const destinationPath = path.join(repositoryRoot, destination);

  await mkdir(path.dirname(destinationPath), { recursive: true });

  try {
    await copyFile(sourcePath, destinationPath, constants.COPYFILE_EXCL);
    process.stdout.write(`created ${destination}\n`);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      process.stdout.write(`kept ${destination}\n`);
      continue;
    }

    throw error;
  }
}

process.stdout.write('\nBootstrap complete. Run `pnpm db:start`, then `pnpm dev`.\n');
