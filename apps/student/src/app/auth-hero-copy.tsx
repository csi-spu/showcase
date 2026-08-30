import { BlurFade } from '@/components/ui/blur-fade';

export function AuthHeroCopy() {
  return (
    <div className="relative z-20 mt-12 hidden max-w-md gap-5 lg:grid xl:mt-16">
      <BlurFade direction="up" offset={8}>
        <h2
          aria-label="ระบบจัดการผลงานนักศึกษา"
          className="text-[clamp(2.75rem,4vw,4.75rem)] leading-[1.02] font-semibold tracking-[-0.045em]"
        >
          <span aria-hidden="true" className="block">
            ระบบจัดการ
          </span>
          <span aria-hidden="true" className="block text-primary">
            ผลงานนักศึกษา
          </span>
        </h2>
      </BlurFade>
      <BlurFade delay={0.08} direction="up" offset={8}>
        <p className="max-w-[34ch] border-l-2 border-primary/70 bg-white/40 px-4 py-3 text-base leading-7 font-medium text-foreground/75 backdrop-blur-sm">
          จัดการโปรไฟล์และผลงานของนักศึกษา CSI ในที่เดียว
        </p>
      </BlurFade>
    </div>
  );
}
