import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { Button } from '@showcase/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { getAdminAuthPageState } from '@/lib/admin-auth-page-state';
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
  const parsed = z.uuid().safeParse(query.workPublicId);
  if (parsed.success) redirect(`/corrections/${parsed.data}`);

  return (
    <AdminWorkspaceShell activePage="corrections">
      <header className="mb-8 flex max-w-4xl flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">{t('navigation')}</p>
        <h1 className="text-3xl leading-[1.25] font-semibold tracking-tight sm:text-4xl">
          {t('lookupTitle')}
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground">{t('lookupDescription')}</p>
      </header>
      <form className="grid max-w-[45rem] gap-5 rounded-surface border border-border bg-card p-6">
        <Field>
          <FieldLabel htmlFor="correction-work-public-id">{t('workPublicId')}</FieldLabel>
          <Input
            aria-invalid={query.workPublicId !== undefined && !parsed.success}
            id="correction-work-public-id"
            name="workPublicId"
            required
          />
          <FieldDescription>{t('workPublicIdHelp')}</FieldDescription>
        </Field>
        {query.workPublicId !== undefined && !parsed.success ? (
          <p className="text-sm text-destructive" role="alert">
            {t('workPublicIdInvalid')}
          </p>
        ) : null}
        <Button className="w-full sm:w-fit" type="submit">
          {t('lookupSubmit')}
        </Button>
      </form>
    </AdminWorkspaceShell>
  );
}
