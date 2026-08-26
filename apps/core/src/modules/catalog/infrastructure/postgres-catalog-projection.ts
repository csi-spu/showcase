import type postgres from 'postgres';
import { normalizeCatalogSearchText } from '../domain/catalog-query-policy';

interface ProjectionSourceRow {
  academic_year: number;
  attributions: string;
  category: 'academic_article' | 'competition_entry' | 'course_work';
  description: string;
  published_at: Date;
  revision_id: string;
  semester: '1' | '2' | 'summer';
  summary: string;
  tags: string;
  title: string;
  work_id: string;
  work_public_id: string;
}

export async function refreshPublicWorkCatalog(
  sql: postgres.TransactionSql,
  workId: string,
  publishedAt: Date | null = null,
): Promise<void> {
  const rows = await sql<ProjectionSourceRow[]>`
    select work.id as work_id, work.public_id as work_public_id, revision.id as revision_id,
      revision.title, revision.summary, revision.description, revision.category,
      revision.academic_year, revision.semester,
      coalesce(${publishedAt}, publication.published_at) as published_at,
      coalesce((
        select string_agg(tag.normalized_identity, ' ' order by tag.position)
        from private.work_revision_tags as tag where tag.revision_id = revision.id
      ), '') as tags,
      coalesce((
        select string_agg(attribution.attribution_name, ' ' order by attribution.position)
        from private.work_revision_attributions as attribution
        where attribution.revision_id = revision.id
      ), '') as attributions
    from public.works as work
    join private.work_revisions as revision on revision.id = work.published_revision_id
    join lateral (
      select max(review.reviewed_at) as published_at from private.reviews as review
      where review.revision_id = revision.id and review.decision = 'approved'
    ) as publication on publication.published_at is not null
    where work.id = ${workId} and work.activity_state = 'active'
      and work.publication_state = 'published' and revision.status = 'approved'
    limit 1
  `;
  const source = rows[0];
  if (source === undefined) {
    await sql`delete from private.public_work_catalog where work_id = ${workId}`;
    return;
  }

  const normalizedTitle = normalizeCatalogSearchText(source.title);
  const normalizedSummary = normalizeCatalogSearchText(source.summary);
  const normalizedTags = normalizeCatalogSearchText(source.tags);
  const normalizedAttributions = normalizeCatalogSearchText(source.attributions);
  const normalizedDescription = normalizeCatalogSearchText(source.description);
  const normalizedSearch = [
    normalizedTitle,
    normalizedSummary,
    normalizedTags,
    normalizedAttributions,
    normalizedDescription,
  ].join(' ');
  const semesterOrder = source.semester === 'summer' ? 3 : Number(source.semester);

  await sql`
    insert into private.public_work_catalog (
      work_id, revision_id, work_public_id, title, summary, description, category,
      academic_year, semester, semester_order, published_at, normalized_title,
      normalized_summary, normalized_tags, normalized_attributions,
      normalized_description, normalized_search
    ) values (
      ${source.work_id}, ${source.revision_id}, ${source.work_public_id}, ${source.title},
      ${source.summary}, ${source.description}, ${source.category}, ${source.academic_year},
      ${source.semester}, ${semesterOrder}, ${source.published_at}, ${normalizedTitle},
      ${normalizedSummary}, ${normalizedTags}, ${normalizedAttributions},
      ${normalizedDescription}, ${normalizedSearch}
    ) on conflict (work_id) do update set
      revision_id = excluded.revision_id,
      work_public_id = excluded.work_public_id,
      title = excluded.title,
      summary = excluded.summary,
      description = excluded.description,
      category = excluded.category,
      academic_year = excluded.academic_year,
      semester = excluded.semester,
      semester_order = excluded.semester_order,
      published_at = excluded.published_at,
      normalized_title = excluded.normalized_title,
      normalized_summary = excluded.normalized_summary,
      normalized_tags = excluded.normalized_tags,
      normalized_attributions = excluded.normalized_attributions,
      normalized_description = excluded.normalized_description,
      normalized_search = excluded.normalized_search
  `;
}
