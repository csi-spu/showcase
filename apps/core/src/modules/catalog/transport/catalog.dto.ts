import { Allow } from 'class-validator';
import type { RawPeopleCatalogQuery, RawWorkCatalogQuery } from '../domain/catalog-query-policy';

export class WorkCatalogQueryDto implements RawWorkCatalogQuery {
  @Allow()
  category?: string | string[];

  @Allow()
  limit?: string | string[];

  @Allow()
  page?: string | string[];

  @Allow()
  profile?: string | string[];

  @Allow()
  q?: string | string[];

  @Allow()
  semester?: string | string[];

  @Allow()
  sort?: string | string[];

  @Allow()
  tag?: string | string[];

  @Allow()
  year?: string | string[];
}

export class PeopleCatalogQueryDto implements RawPeopleCatalogQuery {
  @Allow()
  entryYear?: string | string[];

  @Allow()
  limit?: string | string[];

  @Allow()
  page?: string | string[];

  @Allow()
  q?: string | string[];

  @Allow()
  sort?: string | string[];
}

export class TagSuggestionQueryDto {
  @Allow()
  q?: string | string[];
}
