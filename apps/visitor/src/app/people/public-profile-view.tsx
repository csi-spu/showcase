import { cn } from '@showcase/ui/cn';
import Image from 'next/image';
import { ArrowUpRightIcon, GraduationCapIcon, UserRoundIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PublicProfile } from '@/lib/public-profile-core';

interface PublicProfileLabels {
  bioFallback: string;
  entryYear: string;
  eyebrow: string;
  links: string;
  linksFallback: string;
  photoAlt: string;
}

export function PublicProfileView({
  labels,
  profile,
}: {
  labels: PublicProfileLabels;
  profile: PublicProfile;
}) {
  const bio = profile.bio?.trim();
  const rosterName = `${profile.firstName} ${profile.lastName}`;

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6">
      <header className="rounded-surface border border-border bg-card">
        <div className="flex flex-col items-start gap-5 px-5 py-6 sm:flex-row sm:items-center sm:gap-6 sm:px-7 sm:py-8">
          <div className="relative size-28 shrink-0 overflow-hidden rounded-full border border-border bg-muted sm:size-32">
            {profile.photo ? (
              <Image
                alt={labels.photoAlt}
                className="object-cover"
                fill
                sizes="128px"
                src={`/people/${profile.publicId}/photo`}
                unoptimized
              />
            ) : (
              <ProfilePhotoFallback alt={labels.photoAlt} />
            )}
          </div>
          <div className="grid min-w-0 gap-2">
            <p className="text-sm font-semibold tracking-[0.16em] text-primary">{labels.eyebrow}</p>
            <h1 className="text-balance break-words text-[clamp(1.5rem,4vw,2.5rem)] leading-tight font-semibold tracking-[-0.035em]">
              {rosterName}
            </h1>
            <p
              className={cn(
                'max-w-[60ch] text-pretty break-words',
                bio ? 'text-foreground/85' : 'text-muted-foreground italic',
              )}
            >
              {bio || labels.bioFallback}
            </p>
            <p className="flex items-center gap-2 text-sm font-medium text-foreground/80">
              <GraduationCapIcon aria-hidden="true" className="size-4 text-primary" />
              {labels.entryYear}
            </p>
          </div>
        </div>
      </header>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>
            <h2>{labels.links}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {profile.links.length > 0 ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {profile.links.map((link) => (
                <li key={link.url}>
                  <a
                    className="flex min-h-11 items-center justify-between gap-3 rounded-control border border-border bg-background px-4 py-2 font-medium text-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    href={link.url}
                    rel="external noopener noreferrer"
                  >
                    <span className="truncate">{link.label}</span>
                    <ArrowUpRightIcon aria-hidden="true" className="size-4 shrink-0" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">{labels.linksFallback}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProfilePhotoFallback({ alt }: { alt: string }) {
  return (
    <div
      className="grid size-full place-items-center bg-primary/[0.06]"
      data-profile-photo-fallback="true"
    >
      <span className="sr-only">{alt}</span>
      <UserRoundIcon aria-hidden="true" className="size-12 text-primary/60" strokeWidth={1.15} />
    </div>
  );
}
