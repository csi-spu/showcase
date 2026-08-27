import Image from 'next/image';
import { Marquee } from '@/components/ui/marquee';

type TechnologyGlyphKind = 'code' | 'data' | 'network';

export function HomepageBrandMarquee({
  csiLogoAlt,
  label,
  sitLogoAlt,
  spuLogoAlt,
}: {
  csiLogoAlt: string;
  label: string;
  sitLogoAlt: string;
  spuLogoAlt: string;
}) {
  return (
    <section
      aria-label={label}
      className="relative mt-9 w-full max-w-xl overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]"
      data-homepage-brand-marquee="true"
      data-homepage-brand-marquee-size="compact"
    >
      <Marquee className="py-1 [--duration:26s] [--gap:0.75rem]" pauseOnHover repeat={2}>
        <BrandLogo
          alt={csiLogoAlt}
          className="w-28 sm:w-32"
          height={363}
          src="/brand/csi-computer-science-software-development-innovation.png"
          width={1280}
        />
        <TechnologyGlyph kind="code" />
        <BrandLogo
          alt={sitLogoAlt}
          className="w-20 sm:w-24"
          height={212}
          src="/brand/sit-school-of-information-technology-color.webp"
          width={640}
        />
        <TechnologyGlyph kind="data" />
        <BrandLogo
          alt={spuLogoAlt}
          className="w-14 sm:w-16"
          height={600}
          src="/brand/new_logo_spu01.gif"
          unoptimized
          width={1000}
        />
        <TechnologyGlyph kind="network" />
      </Marquee>
    </section>
  );
}

function BrandLogo({
  alt,
  className,
  height,
  src,
  unoptimized = false,
  width,
}: {
  alt: string;
  className: string;
  height: number;
  src: string;
  unoptimized?: boolean;
  width: number;
}) {
  return (
    <div className="flex h-12 shrink-0 items-center px-2" data-brand-logo-frame="none">
      <Image
        alt={alt}
        className={`h-auto max-h-8 object-contain brightness-0 invert opacity-45 ${className}`}
        data-brand-logo-image="monochrome"
        height={height}
        sizes="(max-width: 639px) 112px, 128px"
        src={src}
        unoptimized={unoptimized}
        width={width}
      />
    </div>
  );
}

function TechnologyGlyph({ kind }: { kind: TechnologyGlyphKind }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-8 shrink-0 place-items-center self-center text-white/45"
      data-tech-glyph-frame="none"
    >
      <svg
        aria-hidden="true"
        className="size-4"
        data-tech-glyph={kind}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.25"
        viewBox="0 0 24 24"
      >
        {glyphPaths(kind)}
      </svg>
    </span>
  );
}

function glyphPaths(kind: TechnologyGlyphKind) {
  if (kind === 'code') {
    return (
      <>
        <path d="m8 7-5 5 5 5" />
        <path d="m16 7 5 5-5 5" />
        <path d="m14 4-4 16" />
      </>
    );
  }
  if (kind === 'data') {
    return (
      <>
        <ellipse cx="12" cy="5" rx="7" ry="3" />
        <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
        <path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
      </>
    );
  }
  return (
    <>
      <circle cx="12" cy="5" r="2.5" />
      <circle cx="5" cy="18" r="2.5" />
      <circle cx="19" cy="18" r="2.5" />
      <path d="m10.8 7.2-4.6 8.6M13.2 7.2l4.6 8.6M7.5 18h9" />
    </>
  );
}
