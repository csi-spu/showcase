import Image from 'next/image';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { GridPattern } from './grid-pattern';

/*
 * The signed-out layout. On desktop it is a two-pane split: brand on one side,
 * the form on the other. The old layout kept a 28rem card centred in an
 * otherwise empty page, which looked broken on a wide screen. Below `lg` the
 * brand pane collapses to a compact header so the form still leads on a phone.
 *
 * The brand pane is `primary-soft`, not solid `primary`, matching the Admin
 * sign-in page. A saturated fill would force the colour SIT logo to be
 * knocked out to white, which destroys the wordmark, so the tint keeps the
 * official asset legible and the two sign-in screens consistent.
 *
 * `GridPattern` sits behind the content as decoration only. It is masked so it
 * fades out before it reaches the text, and it inherits the primary token, so
 * the whole panel still restyles from the shared palette alone.
 *
 * The pane centres its column rather than spreading it edge to edge. Pinning
 * the logo to the top and the tagline to the bottom left a tall screen with a
 * dead band between them, so the two now travel together down the pane.
 */
export function AuthLayout({
  children,
  eyebrow,
  icon: Icon,
  tagline,
}: {
  children: ReactNode;
  eyebrow: string;
  icon: LucideIcon;
  tagline: string;
}) {
  return (
    <div className="flex min-h-svh flex-col lg:grid lg:grid-cols-2">
      <aside className="auth-brand-panel relative isolate flex flex-col gap-10 overflow-hidden border-b border-primary/15 px-6 py-8 sm:px-10 lg:justify-center lg:gap-14 lg:border-r lg:border-b-0 lg:px-12 lg:py-12">
        <GridPattern className="[mask-image:radial-gradient(48rem_32rem_at_15%_0%,black,transparent)]" />
        <div className="relative z-10 flex min-w-0 items-center gap-4">
          <Image
            alt="ตราสัญลักษณ์ CSI"
            className="h-auto w-[clamp(7.5rem,18vw,10rem)]"
            height={363}
            priority
            sizes="160px"
            src="/brand/csi-computer-science-software-development-innovation.png"
            width={1280}
          />
          <Image
            alt="คณะเทคโนโลยีสารสนเทศ"
            className="hidden h-auto w-20 border-l border-primary/20 pl-4 sm:block"
            height={381}
            priority
            sizes="80px"
            src="/brand/sit-school-of-information-technology-color.webp"
            width={1280}
          />
        </div>
        <div className="relative z-10 flex flex-col gap-3 lg:gap-4">
          <span className="flex size-11 items-center justify-center rounded-full bg-white/70 text-primary">
            <Icon aria-hidden="true" className="size-5" />
          </span>
          <p className="text-sm font-semibold tracking-[0.14em] text-primary uppercase">
            {eyebrow}
          </p>
          <p className="max-w-md text-xl leading-snug font-semibold text-balance text-foreground lg:text-3xl">
            {tagline}
          </p>
        </div>
      </aside>

      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8 lg:px-12">
        <div className="flex w-full max-w-sm flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}
