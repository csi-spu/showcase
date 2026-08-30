import { buttonVariants } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import {
  ArrowRightIcon,
  ClipboardCheckIcon,
  FileSpreadsheetIcon,
  RotateCcwIcon,
  UserRoundCogIcon,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminWorkspacePage } from './admin-workspace-page';

interface AdminDashboardLabels {
  accountDescription: string;
  accountTitle: string;
  description: string;
  eyebrow: string;
  recoveryDescription: string;
  recoveryTitle: string;
  reviewDescription: string;
  reviewTitle: string;
  rosterDescription: string;
  rosterTitle: string;
  title: string;
}

export function AdminDashboard({ labels }: { labels: AdminDashboardLabels }) {
  return (
    <AdminWorkspacePage
      description={labels.description}
      eyebrow={labels.eyebrow}
      title={labels.title}
    >
      <section
        aria-label={labels.description}
        className="grid gap-5 md:grid-cols-2 xl:grid-cols-12"
      >
        <DashboardAction
          className="xl:col-span-7"
          description={labels.reviewDescription}
          href="/works?view=reviews"
          icon={ClipboardCheckIcon}
          title={labels.reviewTitle}
        />
        <DashboardAction
          className="xl:col-span-5"
          description={labels.recoveryDescription}
          href="/works?view=removals"
          icon={RotateCcwIcon}
          title={labels.recoveryTitle}
        />
        <DashboardAction
          className="xl:col-span-5"
          description={labels.rosterDescription}
          href="/roster"
          icon={FileSpreadsheetIcon}
          title={labels.rosterTitle}
        />
        <DashboardAction
          className="xl:col-span-7"
          description={labels.accountDescription}
          href="/account-controls"
          icon={UserRoundCogIcon}
          title={labels.accountTitle}
        />
      </section>
    </AdminWorkspacePage>
  );
}

function DashboardAction({
  className,
  description,
  href,
  icon: Icon,
  title,
}: {
  className?: string;
  description: string;
  href: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <Card
      className={cn(
        'group min-h-52 justify-between transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        className,
      )}
    >
      <CardHeader className="h-full content-between gap-6 p-6 sm:p-7">
        <span className="grid size-11 place-items-center rounded-control bg-primary-soft text-primary transition-transform duration-200 group-hover:scale-105 motion-reduce:transition-none">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div className="grid gap-2">
          <CardTitle>
            <h2 className="text-xl font-semibold sm:text-2xl">{title}</h2>
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Link className={buttonVariants({ className: 'w-fit', variant: 'outline' })} href={href}>
          {title}
          <ArrowRightIcon
            aria-hidden="true"
            className="transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"
            data-icon="inline-end"
          />
        </Link>
      </CardHeader>
    </Card>
  );
}
