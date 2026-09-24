'use client';

import { cn } from '@showcase/ui/cn';
import { CalendarRangeIcon, CheckCircle2Icon, ChevronRightIcon, CircleDotIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { StatusBadge } from '@/components/ui/status-badge';

type RoundStatus = 'active' | 'closed';
type RoundFilter = 'all' | RoundStatus;

export interface RoundListItem {
  createdAtLabel: string;
  id: string;
  name: string;
  status: RoundStatus;
}

interface RoundListLabels {
  active: string;
  all: string;
  closed: string;
  description: string;
  filter: string;
  title: string;
}

export function RoundList({
  labels,
  rounds,
}: {
  labels: RoundListLabels;
  rounds: RoundListItem[];
}) {
  const [filter, setFilter] = useState<RoundFilter>('all');
  const activeCount = rounds.filter((round) => round.status === 'active').length;
  const closedCount = rounds.length - activeCount;
  const visibleRounds =
    filter === 'all' ? rounds : rounds.filter((round) => round.status === filter);
  const filters: { count: number; label: string; value: RoundFilter }[] = [
    { count: rounds.length, label: labels.all, value: 'all' },
    { count: activeCount, label: labels.active, value: 'active' },
    { count: closedCount, label: labels.closed, value: 'closed' },
  ];

  return (
    <section aria-labelledby="round-list-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h2
            className="text-xl leading-tight font-semibold tracking-tight text-foreground sm:text-2xl"
            id="round-list-title"
          >
            {labels.title}
          </h2>
          <p className="text-sm text-muted-foreground">{labels.description}</p>
        </div>

        <div aria-label={labels.filter} className="flex flex-wrap gap-2" role="group">
          {filters.map((item) => {
            const isSelected = item.value === filter;
            return (
              <button
                aria-pressed={isSelected}
                className={cn(
                  'flex min-h-11 items-center gap-2 rounded-control border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                  isSelected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border/80 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
                key={item.value}
                onClick={() => setFilter(item.value)}
                type="button"
              >
                <span>{item.label}</span>{' '}
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                    isSelected ? 'bg-primary-foreground/20' : 'bg-muted text-foreground',
                  )}
                >
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <ul className="grid gap-3 md:grid-cols-2">
        {visibleRounds.map((round) => (
          <li className="h-full" key={round.id}>
            <RoundCard labels={labels} round={round} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RoundCard({ labels, round }: { labels: RoundListLabels; round: RoundListItem }) {
  const isActive = round.status === 'active';

  return (
    <Link
      className="group relative flex h-full min-h-28 items-center gap-4 overflow-hidden rounded-surface border border-border/80 bg-card px-5 py-4 transition-colors hover:border-primary/40 hover:bg-primary-soft/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
      href={`/rounds/${round.id}`}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 left-0 w-1',
          isActive ? 'bg-success' : 'bg-muted-foreground/50',
        )}
      />
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-information-background text-information">
        <CalendarRangeIcon aria-hidden="true" className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="line-clamp-2 font-medium text-foreground">{round.name}</span>
          <StatusBadge
            icon={isActive ? CircleDotIcon : CheckCircle2Icon}
            tone={isActive ? 'success' : 'muted'}
          >
            {isActive ? labels.active : labels.closed}
          </StatusBadge>
        </span>
        <span className="text-sm text-muted-foreground">{round.createdAtLabel}</span>
      </span>
      <ChevronRightIcon
        aria-hidden="true"
        className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transition-none"
      />
    </Link>
  );
}
