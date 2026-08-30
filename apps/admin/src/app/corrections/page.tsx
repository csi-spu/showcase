import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Button } from '@showcase/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { getAdminAuthPageState } from '@/lib/admin-auth-page-state';
import { parseAdminWorkReference } from '@/lib/admin-work-reference';
import { AdminWorkspacePage } from '../admin-workspace-page';
import { AdminWorkspaceShell } from '../admin-workspace-shell';

export default async function CorrectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ workPublicId?: string }>;
}) {
  const [state, t, query] = await Promise.all([
    getAdminAuthPageState(),
    getTranslations('Correction'),
    searchParams,
  ]);
  if (state.kind !== 'active') redirect(state.kind === 'expired' ? '/?expired=1' : '/');
  const workPublicId = parseAdminWorkReference(query.workPublicId);
  if (workPublicId !== null) redirect(`/corrections/${workPublicId}`);

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
      </AdminWorkspacePage>
    </AdminWorkspaceShell>
  );
}
