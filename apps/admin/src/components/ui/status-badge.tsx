import { cn } from '@showcase/ui/cn';
import { AlertTriangleIcon, CheckCircle2Icon, InfoIcon, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

const STATUS_TONE_CLASSES = {
  information: 'bg-information-background text-information',
  neutral: 'bg-muted text-muted-foreground',
  primary: 'bg-primary text-primary-foreground',
  success: 'bg-success-background text-success',
  warning: 'bg-warning-background text-warning',
} as const;

const STATUS_TONE_ICONS: Record<keyof typeof STATUS_TONE_CLASSES, LucideIcon | null> = {
  information: InfoIcon,
  neutral: null,
  primary: null,
  success: CheckCircle2Icon,
  warning: AlertTriangleIcon,
};

export type StatusTone = keyof typeof STATUS_TONE_CLASSES;

export function StatusBadge({
  children,
  className,
  icon,
  tone,
}: {
  children: ReactNode;
  className?: string;
  icon?: LucideIcon | false;
  tone: StatusTone;
}) {
  const Icon = icon === false ? null : (icon ?? STATUS_TONE_ICONS[tone]);
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium',
        STATUS_TONE_CLASSES[tone],
        className,
      )}
    >
      {Icon ? <Icon aria-hidden="true" className="size-3.5 shrink-0" /> : null}
      {children}
    </span>
  );
}

export function PulseDot({ tone = 'warning' }: { tone?: 'primary' | 'success' | 'warning' }) {
  const dotClass =
    tone === 'primary' ? 'bg-primary' : tone === 'success' ? 'bg-success' : 'bg-warning';
  return (
    <span aria-hidden="true" className="relative flex size-2 shrink-0">
      <span
        className={cn(
          'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:hidden',
          dotClass,
        )}
      />
      <span className={cn('relative inline-flex size-2 rounded-full', dotClass)} />
    </span>
  );
}
