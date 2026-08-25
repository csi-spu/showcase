import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { getStudentAuthPageState } from '@/lib/student-auth-page-state';
import { readStudentSessionToken } from '@/lib/student-auth-session';
import { getStudentServerEnvironment } from '@/lib/server-environment';
import { StudentWorksCoreClient, StudentWorksCoreError } from '@/lib/student-works-core';
import { WorkForm } from '../work-form';
import { updateWorkAction } from '../work.actions';

export default async function EditWorkPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId: rawPublicId } = await params;
  const parsedPublicId = z.uuid().safeParse(rawPublicId);
  if (!parsedPublicId.success) notFound();
  const state = await getStudentAuthPageState();
  if (state.kind !== 'active' || !state.session.canUseStudentCapabilities) redirect('/');
  const sessionToken = await readStudentSessionToken();
  if (sessionToken === null) redirect('/?expired=1');

  const client = new StudentWorksCoreClient(getStudentServerEnvironment());
  let context;
  let work;
  try {
    [context, work] = await Promise.all([
      client.getAuthoringContext(sessionToken),
      client.getWork(sessionToken, parsedPublicId.data),
    ]);
  } catch (error: unknown) {
    handleLoadError(error);
  }
  const [t, idempotencyKey] = await Promise.all([
    getTranslations('WorkPage'),
    Promise.resolve(randomUUID()),
  ]);
  const action = updateWorkAction.bind(null, parsedPublicId.data);

  return (
    <main className="mx-auto min-h-svh w-full max-w-[1440px] bg-background">
      <header className="border-b border-border px-[clamp(1rem,4vw,3rem)] py-6">
        <nav aria-label={t('navigation')} className="flex items-center justify-between gap-4">
          <Link className="font-semibold tracking-[0.12em]" href="/">
            STUDENT SHOWCASE
          </Link>
          <Link className="text-sm font-medium text-primary underline" href="/">
            {t('back')}
          </Link>
        </nav>
      </header>
      <div className="grid gap-10 px-[clamp(1rem,4vw,3rem)] py-10 lg:grid-cols-12 lg:py-16">
        <header className="grid content-start gap-4 lg:col-span-4">
          <p className="text-sm font-semibold tracking-[0.16em] text-primary">PRIVATE DRAFT</p>
          <h1 className="text-3xl leading-[1.25] font-semibold tracking-tight sm:text-4xl">
            {t('editHeading')}
          </h1>
          <p className="text-muted-foreground">{t('editDescription')}</p>
          <p className="text-sm text-muted-foreground">{t('version', { version: work.version })}</p>
        </header>
        <div className="lg:col-span-8">
          <WorkForm
            action={action}
            context={context}
            idempotencyKey={idempotencyKey}
            mode="edit"
            publicId={parsedPublicId.data}
            work={work}
          />
        </div>
      </div>
    </main>
  );
}

function handleLoadError(error: unknown): never {
  if (
    error instanceof StudentWorksCoreError &&
    ['SESSION_EXPIRED', 'UNAUTHENTICATED'].includes(error.code)
  ) {
    redirect('/?expired=1');
  }
  if (error instanceof StudentWorksCoreError && error.code === 'WORK_NOT_FOUND') notFound();
  if (error instanceof StudentWorksCoreError && error.code === 'FORBIDDEN') redirect('/');
  throw error;
}
