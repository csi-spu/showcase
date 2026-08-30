'use client';

import { Badge } from '@/components/ui/badge';
import { Progress, ProgressLabel } from '@/components/ui/progress';
import {
  STUDENT_PASSWORD_REQUIREMENT_KEYS,
  evaluateStudentPassword,
} from '@/lib/student-password-policy';
import { CheckIcon, CircleIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function PasswordStrength({ password }: { password: string }) {
  const t = useTranslations('Auth.change.strength');
  const evaluation = evaluateStudentPassword(password);

  return (
    <section aria-label={t('label')} className="flex flex-col gap-3" id="new-password-strength">
      <Progress
        aria-label={t('label')}
        aria-valuetext={t(`levels.${evaluation.strength}`)}
        value={evaluation.percentage}
      >
        <ProgressLabel>{t('label')}</ProgressLabel>
        <Badge aria-live="polite" variant={evaluation.isValid ? 'default' : 'secondary'}>
          {t(`levels.${evaluation.strength}`)}
        </Badge>
      </Progress>
      <ul className="flex flex-wrap gap-2">
        {STUDENT_PASSWORD_REQUIREMENT_KEYS.map((requirement) => {
          const isSatisfied = evaluation.requirements[requirement];
          const RequirementIcon = isSatisfied ? CheckIcon : CircleIcon;

          return (
            <li data-satisfied={isSatisfied} key={requirement}>
              <Badge variant={isSatisfied ? 'default' : 'outline'}>
                <RequirementIcon aria-hidden="true" data-icon="inline-start" />
                <span className="sr-only">{isSatisfied ? t('passed') : t('notPassed')}</span>
                {t(`requirements.${requirement}`)}
              </Badge>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
