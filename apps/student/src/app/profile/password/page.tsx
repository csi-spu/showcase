import { buttonVariants } from '@showcase/ui/button';
import { ArrowLeftIcon, KeyRoundIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getStudentAuthPageState } from '@/lib/student-auth-page-state';
import { changePasswordFromProfileAction } from '../../student-auth.actions';
import { ChangePasswordForm } from '../../student-auth-forms';
import { StudentWorkspaceShell } from '../../student-workspace-shell';

export default async function ProfilePasswordPage() {
  const [state, t] = await Promise.all([
    getStudentAuthPageState(),
    getTranslations('PasswordPage'),
  ]);
  if (state.kind !== 'active') redirect('/');

  return (
    <StudentWorkspaceShell activePage="edit-profile">
      <main className="mx-auto grid max-w-2xl gap-5">
        <Link
          className={buttonVariants({ className: 'w-fit', size: 'sm', variant: 'ghost' })}
          href="/profile"
        >
          <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
          {t('back')}
        </Link>
        <Card className="overflow-hidden border-border/80 shadow-[0_1.5rem_4rem_-3rem_rgba(50,20,45,0.24)]">
          <CardHeader className="gap-3 border-b border-border/80 bg-primary-soft/45 p-6 sm:p-8">
            <span className="grid size-11 place-items-center rounded-control bg-primary text-primary-foreground">
              <KeyRoundIcon aria-hidden="true" className="size-5" />
            </span>
            <CardTitle>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('heading')}</h1>
            </CardTitle>
            <CardDescription className="max-w-xl">{t('description')}</CardDescription>
          </CardHeader>
          <CardContent className="p-6 sm:p-8">
            <ChangePasswordForm
              action={changePasswordFromProfileAction}
              submitLabel={t('submit')}
            />
          </CardContent>
        </Card>
      </main>
    </StudentWorkspaceShell>
  );
}
