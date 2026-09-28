'use client';

import { Progress } from '@base-ui/react/progress';
import {
  PASSWORD_REQUIREMENT_KEYS,
  evaluatePassword,
  type PasswordRequirement,
  type PasswordStrength as PasswordStrengthLevel,
} from '@showcase/password-policy';
import { CheckIcon, CircleIcon } from 'lucide-react';

import { Badge } from './badge';

export type PasswordStrengthMessageKey =
  | 'label'
  | 'notPassed'
  | 'passed'
  | `levels.${PasswordStrengthLevel}`
  | `requirements.${PasswordRequirement}`;

interface PasswordStrengthProps {
  id: string;
  password: string;
  translate: (key: PasswordStrengthMessageKey) => string;
}

export function PasswordStrength({ id, password, translate }: PasswordStrengthProps) {
  const evaluation = evaluatePassword(password);
  const level = translate(`levels.${evaluation.strength}`);

  return (
    <section aria-label={translate('label')} className="flex flex-col gap-3" id={id}>
      <Progress.Root
        aria-label={translate('label')}
        aria-valuetext={level}
        className="flex flex-wrap gap-3"
        data-slot="progress"
        value={evaluation.percentage}
      >
        <Progress.Label className="text-sm font-medium" data-slot="progress-label">
          {translate('label')}
        </Progress.Label>
        <Badge aria-live="polite" variant={evaluation.isValid ? 'default' : 'secondary'}>
          {level}
        </Badge>
        <Progress.Track
          className="relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted"
          data-slot="progress-track"
        >
          <Progress.Indicator
            className="h-full bg-primary transition-all motion-reduce:transition-none"
            data-slot="progress-indicator"
          />
        </Progress.Track>
      </Progress.Root>
      <ul className="flex flex-wrap gap-2">
        {PASSWORD_REQUIREMENT_KEYS.map((requirement) => {
          const isSatisfied = evaluation.requirements[requirement];
          const RequirementIcon = isSatisfied ? CheckIcon : CircleIcon;

          return (
            <li data-satisfied={isSatisfied} key={requirement}>
              <Badge variant={isSatisfied ? 'default' : 'outline'}>
                <RequirementIcon aria-hidden="true" data-icon="inline-start" />
                <span className="sr-only">
                  {isSatisfied ? translate('passed') : translate('notPassed')}
                </span>
                {translate(`requirements.${requirement}`)}
              </Badge>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
