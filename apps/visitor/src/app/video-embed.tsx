import { cn } from '@showcase/ui/cn';
import type { PublicWork } from '@/lib/public-work-core';

type VideoLink = PublicWork['videoLinks'][number];

const EMBED_SOURCE: Record<VideoLink['provider'], (providerVideoId: string) => string> = {
  tiktok: (providerVideoId) => `https://www.tiktok.com/embed/v2/${providerVideoId}`,
  youtube: (providerVideoId) => `https://www.youtube-nocookie.com/embed/${providerVideoId}`,
};

export function VideoEmbed({ title, video }: { title: string; video: VideoLink }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-media border border-border bg-black',
        video.provider === 'tiktok'
          ? 'aspect-[9/16] w-64 shrink-0 sm:w-72'
          : 'aspect-video w-full max-w-xl',
      )}
    >
      <iframe
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        className="size-full"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        src={EMBED_SOURCE[video.provider](video.providerVideoId)}
        title={title}
      />
    </div>
  );
}
