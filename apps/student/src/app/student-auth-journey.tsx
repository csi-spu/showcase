'use client';

import { Button } from '@showcase/ui/button';
import { useTranslations } from 'next-intl';
import { FormEvent, useEffect, useState } from 'react';
import { z } from 'zod';

const sessionSchema = z.object({
  canUseStudentCapabilities: z.boolean(),
  csrfToken: z.string().min(1),
  sessionState: z.enum(['active', 'password_change_required']),
});

const errorSchema = z.object({
  error: z.object({ code: z.string() }),
});

type Session = z.infer<typeof sessionSchema>;
type View = 'active' | 'expired' | 'loading' | 'login' | 'password_change_required';
type ErrorMessage =
  'credentials' | 'network' | 'passwordMismatch' | 'passwordPolicy' | 'rateLimited' | 'unavailable';

interface StudentAuthJourneyProps {
  coreUrl: string;
}

export function StudentAuthJourney({ coreUrl }: StudentAuthJourneyProps) {
  const t = useTranslations('Auth');
  const [view, setView] = useState<View>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmedPassword, setConfirmedPassword] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void fetch(endpoint(coreUrl, 'session'), {
      credentials: 'include',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.ok) {
          applySession(sessionSchema.parse(await response.json()));
          return;
        }
        const code = await readErrorCode(response);
        setView(code === 'SESSION_EXPIRED' ? 'expired' : 'login');
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') {
          return;
        }
        setError('network');
        setView('login');
      });
    return () => controller.abort();
  }, [coreUrl]);

  function applySession(nextSession: Session): void {
    setSession(nextSession);
    setError(null);
    setView(nextSession.sessionState);
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    if (!/^\d{8}$/.test(studentId) || password.length === 0) {
      setError('credentials');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(endpoint(coreUrl, 'login'), {
        body: JSON.stringify({ password, studentId }),
        credentials: 'include',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        method: 'POST',
      });
      if (!response.ok) {
        const code = await readErrorCode(response);
        setError(code === 'RATE_LIMITED' ? 'rateLimited' : mapRequestError(code));
        return;
      }
      applySession(sessionSchema.parse(await response.json()));
      setStudentId('');
      setPassword('');
    } catch {
      setError('network');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitPasswordChange(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirmedPassword) {
      setError('passwordMismatch');
      return;
    }
    if (newPassword.length < 12 || newPassword.length > 128 || newPassword === currentPassword) {
      setError('passwordPolicy');
      return;
    }
    if (session === null) {
      setView('expired');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(endpoint(coreUrl, 'change-password'), {
        body: JSON.stringify({ currentPassword, newPassword }),
        credentials: 'include',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-csrf-token': session.csrfToken,
        },
        method: 'POST',
      });
      if (!response.ok) {
        const code = await readErrorCode(response);
        if (code === 'SESSION_EXPIRED' || code === 'UNAUTHENTICATED') {
          setView('expired');
          setSession(null);
          return;
        }
        setError(code === 'INVALID_PASSWORD' ? 'passwordPolicy' : mapRequestError(code));
        return;
      }
      applySession(sessionSchema.parse(await response.json()));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmedPassword('');
    } catch {
      setError('network');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function logout(): Promise<void> {
    if (session === null) {
      setView('login');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(endpoint(coreUrl, 'logout'), {
        credentials: 'include',
        headers: { 'x-csrf-token': session.csrfToken },
        method: 'POST',
      });
      if (!response.ok && response.status !== 401) {
        setError(mapRequestError(await readErrorCode(response)));
        return;
      }
      setSession(null);
      setView('login');
    } catch {
      setError('network');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (view === 'loading') {
    return <p role="status">{t('loading')}</p>;
  }

  if (view === 'expired') {
    return (
      <section className="auth-card" aria-labelledby="expired-heading">
        <p className="auth-kicker">{t('kicker')}</p>
        <h1 id="expired-heading">{t('expired.heading')}</h1>
        <p>{t('expired.description')}</p>
        <Button onClick={() => setView('login')} size="lg">
          {t('expired.action')}
        </Button>
      </section>
    );
  }

  if (view === 'password_change_required') {
    return (
      <section className="auth-card" aria-labelledby="change-heading">
        <p className="auth-kicker">{t('kicker')}</p>
        <h1 id="change-heading">{t('change.heading')}</h1>
        <p>{t('change.description')}</p>
        <form className="auth-form" onSubmit={(event) => void submitPasswordChange(event)}>
          <Field
            autoComplete="current-password"
            label={t('change.currentPassword')}
            onChange={setCurrentPassword}
            type="password"
            value={currentPassword}
          />
          <Field
            autoComplete="new-password"
            label={t('change.newPassword')}
            maxLength={128}
            minLength={12}
            onChange={setNewPassword}
            type="password"
            value={newPassword}
          />
          <Field
            autoComplete="new-password"
            label={t('change.confirmPassword')}
            maxLength={128}
            minLength={12}
            onChange={setConfirmedPassword}
            type="password"
            value={confirmedPassword}
          />
          <p className="field-help">{t('change.requirements')}</p>
          <ErrorNotice error={error} />
          <Button disabled={isSubmitting} size="lg" type="submit">
            {isSubmitting ? t('submitting') : t('change.submit')}
          </Button>
        </form>
      </section>
    );
  }

  if (view === 'active') {
    return (
      <section className="auth-card" aria-labelledby="active-heading">
        <p className="auth-kicker">{t('kicker')}</p>
        <h1 id="active-heading">{t('active.heading')}</h1>
        <p>
          {session?.canUseStudentCapabilities
            ? t('active.description')
            : t('active.readOnlyDescription')}
        </p>
        <ErrorNotice error={error} />
        <Button disabled={isSubmitting} onClick={() => void logout()} size="lg" variant="outline">
          {t('active.logout')}
        </Button>
      </section>
    );
  }

  return (
    <section className="auth-card" aria-labelledby="login-heading">
      <p className="auth-kicker">{t('kicker')}</p>
      <h1 id="login-heading">{t('login.heading')}</h1>
      <p>{t('login.description')}</p>
      <form className="auth-form" onSubmit={(event) => void submitLogin(event)}>
        <Field
          autoComplete="username"
          inputMode="numeric"
          label={t('login.studentId')}
          maxLength={8}
          onChange={setStudentId}
          pattern="[0-9]{8}"
          type="text"
          value={studentId}
        />
        <Field
          autoComplete="current-password"
          label={t('login.password')}
          maxLength={128}
          onChange={setPassword}
          type="password"
          value={password}
        />
        <ErrorNotice error={error} />
        <Button disabled={isSubmitting} size="lg" type="submit">
          {isSubmitting ? t('submitting') : t('login.submit')}
        </Button>
      </form>
    </section>
  );
}

interface FieldProps {
  autoComplete: string;
  inputMode?: 'numeric';
  label: string;
  maxLength?: number;
  minLength?: number;
  onChange(value: string): void;
  pattern?: string;
  type: 'password' | 'text';
  value: string;
}

function Field({ label, onChange, ...input }: FieldProps) {
  return (
    <label className="auth-field">
      <span>{label}</span>
      <input
        {...input}
        aria-invalid={false}
        onChange={(event) => onChange(event.currentTarget.value)}
        required
      />
    </label>
  );
}

function ErrorNotice({ error }: { error: ErrorMessage | null }) {
  const t = useTranslations('Auth.errors');
  return error === null ? null : <p role="alert">{t(error)}</p>;
}

function endpoint(coreUrl: string, action: string): string {
  return new URL(`/v1/student/auth/${action}`, coreUrl).toString();
}

async function readErrorCode(response: Response): Promise<string> {
  try {
    return errorSchema.parse(await response.json()).error.code;
  } catch {
    return 'UNKNOWN';
  }
}

function mapRequestError(code: string): ErrorMessage {
  if (code === 'INVALID_CREDENTIALS') {
    return 'credentials';
  }
  if (code === 'RATE_LIMITED') {
    return 'rateLimited';
  }
  if (code === 'AUTH_PROVIDER_UNAVAILABLE') {
    return 'unavailable';
  }
  return 'unavailable';
}
