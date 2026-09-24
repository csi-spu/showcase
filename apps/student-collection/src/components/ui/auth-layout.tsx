import { AuthDashboardVisual, AuthPage } from '@showcase/ui/auth-page';
import {
  BadgeCheckIcon,
  BarChart3Icon,
  FilePenLineIcon,
  FolderOpenIcon,
  ListChecksIcon,
  SendIcon,
} from 'lucide-react';
import Image from 'next/image';
import type { ReactNode } from 'react';

interface AuthLayoutProps {
  children: ReactNode;
  eyebrow: string;
  featureAssigned: string;
  featureDrafts: string;
  featureTracking: string;
  headline: string;
  headlineAccent: string;
  tagline: string;
}

export function AuthLayout(props: AuthLayoutProps) {
  return (
    <AuthPage
      brand={<BrandLockup />}
      eyebrow={props.eyebrow}
      eyebrowIcon={<FolderOpenIcon aria-hidden="true" className="size-5" />}
      features={[
        {
          icon: <ListChecksIcon aria-hidden="true" className="size-5" />,
          label: props.featureAssigned,
          tone: 'primary',
        },
        {
          icon: <FilePenLineIcon aria-hidden="true" className="size-5" />,
          label: props.featureDrafts,
          tone: 'information',
        },
        {
          icon: <BadgeCheckIcon aria-hidden="true" className="size-5" />,
          label: props.featureTracking,
          tone: 'success',
        },
      ]}
      headline={props.headline}
      headlineAccent={props.headlineAccent}
      tagline={props.tagline}
      visual={
        <AuthDashboardVisual
          chartIcon={<BarChart3Icon className="size-8" />}
          documentIcon={<FilePenLineIcon className="size-6" />}
          sendIcon={<SendIcon fill="currentColor" />}
        />
      }
    >
      {props.children}
    </AuthPage>
  );
}

function BrandLockup() {
  return (
    <div className="auth-brand-lockup">
      <Image
        alt="ตราสัญลักษณ์ CSI"
        className="auth-csi-logo"
        height={363}
        priority
        sizes="(min-width: 1024px) 184px, 144px"
        src="/brand/csi-computer-science-software-development-innovation.png"
        width={1280}
      />
      <span aria-hidden="true" className="auth-brand-divider" />
      <Image
        alt="คณะเทคโนโลยีสารสนเทศ"
        className="auth-sit-logo"
        height={381}
        priority
        sizes="(min-width: 1024px) 112px, 82px"
        src="/brand/sit-school-of-information-technology-color.webp"
        width={1280}
      />
    </div>
  );
}
