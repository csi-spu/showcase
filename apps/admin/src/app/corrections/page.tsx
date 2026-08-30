import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Button, buttonVariants } from '@showcase/ui/button';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getAdminAuthPageState } from '@/lib/admin-auth-page-state';
import { AdminReviewsCoreClient } from '@/lib/admin-reviews-core';
import { parseAdminWorkReference } from '@/lib/admin-work-reference';
import { getAdminServerEnvironment } from '@/lib/server-environment';
import { AdminWorkspacePage } from '../admin-workspace-page';
import { AdminWorkspaceShell } from '../admin-workspace-shell';

export default async function CorrectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; q?: string; workPublicId?: string }>;
}) {
  const [state, t, query] = await Promise.all([
    getAdminAuthPageState(),
    getTranslations('Correction'),
    searchParams,
  ]);
  if (state.kind !== 'active') redirect(state.kind === 'expired' ? '/?expired=1' : '/');
  const workPublicId = parseAdminWorkReference(query.workPublicId);
  if (workPublicId !== null) redirect(`/corrections/${workPublicId}`);
  const search = query.q?.trim() || undefined;
  const page = await new AdminReviewsCoreClient(getAdminServerEnvironment()).listPublishedWorks({
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    limit: 20,
    ...(search === undefined ? {} : { q: search }),
  });

  return (
    <AdminWorkspaceShell activePage="corrections">
      <AdminWorkspacePage
        description={t('lookupDescription')}
        eyebrow={t('navigation')}
        title={t('lookupTitle')}
      >
        <form className="grid max-w-2xl gap-5 rounded-surface border border-border bg-card p-6 shadow-sm sm:p-8">
          <Field>
            <FieldLabel htmlFor="correction-work-public-id">{t('workPublicId')}</FieldLabel>
            <Input
              aria-invalid={query.workPublicId !== undefined && workPublicId === null}
              defaultValue={query.workPublicId ?? ''}
              id="correction-work-public-id"
              name="workPublicId"
              placeholder={t('workReferencePlaceholder')}
              required
            />
            <FieldDescription>{t('workPublicIdHelp')}</FieldDescription>
          </Field>
          {query.workPublicId !== undefined && workPublicId === null ? (
            <p className="text-sm text-destructive" role="alert">
              {t('workPublicIdInvalid')}
            </p>
          ) : null}
          <Button className="w-full sm:w-fit" type="submit">
            {t('lookupSubmit')}
          </Button>
        </form>

        <section aria-labelledby="published-work-heading" className="mt-8 grid max-w-7xl gap-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold" id="published-work-heading">
                {t('table.heading')}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('table.description')}</p>
            </div>
            <form className="flex w-full gap-2 sm:w-auto" method="get">
              <Input
                aria-label={t('table.search')}
                className="min-w-0 sm:w-72"
                defaultValue={search ?? ''}
                name="q"
                placeholder={t('table.searchPlaceholder')}
              />
              <Button type="submit" variant="outline">
                {t('table.searchSubmit')}
              </Button>
            </form>
          </div>
          {page.items.length === 0 ? (
            <p className="rounded-surface border border-dashed border-border p-8 text-muted-foreground">
              {t('table.empty')}
            </p>
          ) : (
            <Table aria-label={t('table.label')}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('table.columns.work')}</TableHead>
                  <TableHead>{t('table.columns.attribution')}</TableHead>
                  <TableHead>{t('table.columns.academicPeriod')}</TableHead>
                  <TableHead>{t('table.columns.status')}</TableHead>
                  <TableHead className="text-right">{t('table.columns.action')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.items.map((work) => (
                  <TableRow key={work.workPublicId}>
                    <TableCell className="max-w-md">
                      <h3 className="line-clamp-2 font-semibold">{work.title}</h3>
                      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                        {work.summary}
                      </p>
                      <time
                        className="mt-2 block text-xs text-muted-foreground"
                        dateTime={work.publishedAt}
                      >
                        {t('table.publishedAt', { value: formatBangkokDate(work.publishedAt) })}
                      </time>
                    </TableCell>
                    <TableCell>{work.attributions.join(', ')}</TableCell>
                    <TableCell>
                      {t('table.academicPeriod', {
                        semester: t(`semesters.${work.academicPeriod.semester}`),
                        year: work.academicPeriod.year,
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{t('table.published')}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Link
                          className={buttonVariants({ size: 'sm' })}
                          href={`/corrections/${work.workPublicId}`}
                        >
                          {t('table.edit')}
                        </Link>
                        <Link
                          className={buttonVariants({ size: 'sm', variant: 'outline' })}
                          href={`/recovery/${work.workPublicId}`}
                        >
                          {t('openRecovery')}
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {page.nextCursor === null ? null : (
            <Link
              className={buttonVariants({ className: 'w-fit', variant: 'outline' })}
              href={correctionNextPageHref(page.nextCursor, search)}
            >
              {t('table.next')}
            </Link>
          )}
        </section>
      </AdminWorkspacePage>
    </AdminWorkspaceShell>
  );
}

function correctionNextPageHref(cursor: string, search: string | undefined): string {
  const query = new URLSearchParams({ cursor });
  if (search !== undefined) query.set('q', search);
  return `/corrections?${query.toString()}`;
}

function formatBangkokDate(value: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value));
}
