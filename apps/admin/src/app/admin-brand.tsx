import { cn } from '@showcase/ui/cn';
import Image from 'next/image';
import Link from 'next/link';

const CSI_BRAND_ASSET = '/brand/csi-computer-science-software-development-innovation.png';

export function AdminBrandMark({ className }: { className?: string }) {
  return (
    <Link
      aria-label="หน้าหลัก Student Showcase"
      className={cn(
        'relative block size-8 shrink-0 self-center overflow-hidden rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        className,
      )}
      href="/"
    >
      <Image
        alt="ตราสัญลักษณ์ CSI"
        className="translate-x-px object-cover object-left"
        fill
        priority
        sizes="32px"
        src={CSI_BRAND_ASSET}
      />
    </Link>
  );
}

export function AdminBrand({ className }: { className?: string }) {
  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)}>
      <Link
        aria-label="หน้าหลัก Student Showcase"
        className="min-w-0 rounded-control focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        href="/"
      >
        <Image
          alt="ตราสัญลักษณ์ CSI"
          className="h-auto w-[clamp(7.5rem,40vw,9.5rem)]"
          height={363}
          priority
          sizes="(max-width: 360px) 120px, 152px"
          src={CSI_BRAND_ASSET}
          width={1280}
        />
      </Link>
    </div>
  );
}
