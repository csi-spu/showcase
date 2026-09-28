import type { DynamicModule, Type } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { RosterModule } from '../../roster/roster.module';
import { CatalogModule } from '../catalog.module';
import { CacheInvalidationWorkerModule } from './cache-invalidation-worker.module';

type ModuleImport = Type | DynamicModule | Promise<DynamicModule>;

function reachableModules(root: Type): Set<Type> {
  const seen = new Set<Type>();
  const visit = (entry: ModuleImport) => {
    if (entry instanceof Promise) return;
    const moduleClass = 'module' in entry ? entry.module : entry;
    if (seen.has(moduleClass)) return;
    seen.add(moduleClass);
    const imports = [
      ...((Reflect.getMetadata(MODULE_METADATA.IMPORTS, moduleClass) as ModuleImport[]) ?? []),
      ...('module' in entry ? (entry.imports ?? []) : []),
    ] as ModuleImport[];
    imports.forEach(visit);
  };
  visit(root);
  return seen;
}

describe('CacheInvalidationWorkerModule', () => {
  /*
   * The cache worker once booted AppModule, which started a second RosterWorker
   * beside Core's. Both processed the same Batch, deadlocked on it, and the
   * stuck worker transaction starved Core's pool until Instructor login failed.
   */
  it('boots the catalog without starting background workers owned by the API', () => {
    const modules = reachableModules(CacheInvalidationWorkerModule);

    expect(modules.has(CatalogModule)).toBe(true);
    expect(modules.has(RosterModule)).toBe(false);
  });
});
