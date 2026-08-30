import { cn } from '@showcase/ui/cn';
import Image from 'next/image';
import Link from 'next/link';

const CSI_BRAND_ASSET = '/brand/csi-computer-science-software-development-innovation.png';

export function StudentBrandMark({ className }: { className?: string }) {
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
        sizes="32px"
        src={CSI_BRAND_ASSET}
      />
    </Link>
  );
}

export function StudentBrand({
  className,
  showSit = false,
}: {
  className?: string;
  showSit?: boolean;
}) {
  return (
    <div className={cn('flex min-w-0 items-center gap-4', className)}>
      <Link
        aria-label="หน้าหลัก Student Showcase"
        className="min-w-0 rounded-control focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        href="/"
      >
        <Image
          alt="สาขาวิทยาการคอมพิวเตอร์และนวัตกรรมการพัฒนาซอฟต์แวร์"
          className="h-auto w-[clamp(7.5rem,18vw,11rem)]"
          height={363}
          priority
          sizes="176px"
          src={CSI_BRAND_ASSET}
          width={1280}
        />
      </Link>
      {showSit ? (
        <Image
          alt="คณะเทคโนโลยีสารสนเทศ"
          className="hidden h-auto w-24 border-l border-border pl-4 sm:block"
          height={381}
          priority
          sizes="96px"
          src="/brand/sit-school-of-information-technology-color.webp"
          width={1280}
        />
      ) : null}
    </div>
  );
}
