import { LayoutTemplateIcon } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { getInstructorAuthPageState } from '@/lib/instructor-auth-page-state';
import { readInstructorSessionToken } from '@/lib/instructor-auth-session';
import { InstructorCollectionFormsCoreClient } from '@/lib/instructor-collection-forms-core';
import { getInstructorServerEnvironment } from '@/lib/server-environment';
import { AppShell } from '../app-shell';

export default async function TemplatesPage() {
  const state = await getInstructorAuthPageState();
  if (state.kind !== 'active') redirect(state.kind === 'expired' ? '/?expired=1' : '/');
  const sessionToken = await readInstructorSessionToken();
  if (sessionToken === null) redirect('/?expired=1');

  const t = await getTranslations('Forms.template');
  const format = await getFormatter();
  const templates = await new InstructorCollectionFormsCoreClient(
    getInstructorServerEnvironment(),
  ).listTemplates(sessionToken);

  return (
    <AppShell trail={[{ label: t('listHeading') }]}>
      <PageHeader description={t('listDescription')} title={t('listHeading')} />
      {templates.length === 0 ? (
        <EmptyState
          description={t('listEmptyDescription')}
          icon={LayoutTemplateIcon}
          title={t('listEmpty')}
        />
      ) : (
        <ul className="flex list-none flex-col gap-2 p-0">
          {templates.map((template) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 rounded-surface border border-input bg-card p-4"
              key={template.id}
            >
              <span className="flex min-w-0 flex-col gap-1">
                <Link
                  className="truncate rounded-control font-medium underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
                  href={`/templates/${template.id}`}
                >
                  {template.name}
                </Link>
                <span className="text-sm text-muted-foreground">
                  {t('updatedAt', {
                    date: format.dateTime(new Date(template.updatedAt), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      timeZone: 'Asia/Bangkok',
                    }),
                  })}
                </span>
              </span>
              <StatusBadge tone="muted">
                {t('fieldCount', { count: template.fields.length })}
              </StatusBadge>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
