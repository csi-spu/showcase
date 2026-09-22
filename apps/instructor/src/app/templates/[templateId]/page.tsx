import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { getInstructorAuthPageState } from '@/lib/instructor-auth-page-state';
import { readInstructorSessionToken } from '@/lib/instructor-auth-session';
import { InstructorCollectionFormsCoreClient } from '@/lib/instructor-collection-forms-core';
import { getInstructorServerEnvironment } from '@/lib/server-environment';
import { AppShell } from '@/app/app-shell';
import { updateCollectionTemplateAction } from '@/app/collection-forms.actions';
import { TemplateEditor } from './template-editor';

interface TemplatePageProps {
  params: Promise<{ templateId: string }>;
}

export default async function TemplatePage({ params }: TemplatePageProps) {
  const { templateId } = await params;
  const state = await getInstructorAuthPageState();
  if (state.kind !== 'active') redirect(state.kind === 'expired' ? '/?expired=1' : '/');
  const sessionToken = await readInstructorSessionToken();
  if (sessionToken === null) redirect('/?expired=1');

  const t = await getTranslations('Forms');
  const templates = await new InstructorCollectionFormsCoreClient(
    getInstructorServerEnvironment(),
  ).listTemplates(sessionToken);

  const template = templates.find((candidate) => candidate.id === templateId);
  if (template === undefined) notFound();

  return (
    <AppShell
      trail={[{ href: '/templates', label: t('template.listHeading') }, { label: template.name }]}
    >
      <PageHeader description={t('template.editDescription')} title={template.name} />
      <TemplateEditor
        saveAction={updateCollectionTemplateAction.bind(null, templateId)}
        template={template}
      />
    </AppShell>
  );
}
