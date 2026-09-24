import type { ReactNode } from 'react';

type AuthFeatureTone = 'information' | 'primary' | 'success';

interface AuthFeature {
  icon: ReactNode;
  label: string;
  tone: AuthFeatureTone;
}

interface AuthPageProps {
  brand: ReactNode;
  children: ReactNode;
  eyebrow: string;
  eyebrowIcon: ReactNode;
  features: AuthFeature[];
  headline: string;
  headlineAccent: string;
  tagline: string;
  visual: ReactNode;
}

export function AuthPage({
  brand,
  children,
  eyebrow,
  eyebrowIcon,
  features,
  headline,
  headlineAccent,
  tagline,
  visual,
}: AuthPageProps) {
  return (
    <div className="auth-login-shell">
      <aside className="auth-brand-panel">
        <div aria-hidden="true" className="auth-css-grid" />
        <div aria-hidden="true" className="auth-orb auth-orb-top" />
        <div aria-hidden="true" className="auth-orb auth-orb-bottom" />

        <div className="auth-hero-content">
          <div className="auth-hero-copy">
            <p className="auth-eyebrow">
              {eyebrowIcon}
              {eyebrow}
            </p>
            <p className="auth-hero-title">
              {headline}
              <span>{headlineAccent}</span>
            </p>
            <p className="auth-hero-description">{tagline}</p>
          </div>
          <div aria-label={eyebrow} className="auth-feature-list">
            {features.map((feature) => (
              <div className="auth-feature-chip" data-tone={feature.tone} key={feature.label}>
                <span>{feature.icon}</span>
                {feature.label}
              </div>
            ))}
          </div>
        </div>

        {visual}
      </aside>

      <main className="auth-login-main">
        <section className="auth-login-card">
          <div className="auth-card-brand">{brand}</div>
          {children}
        </section>
      </main>
    </div>
  );
}

export function AuthDashboardVisual({
  chartIcon,
  documentIcon,
  sendIcon,
}: {
  chartIcon: ReactNode;
  documentIcon: ReactNode;
  sendIcon: ReactNode;
}) {
  return (
    <div aria-hidden="true" className="auth-dashboard-scene">
      <div className="auth-plane-path" />
      <span className="auth-paper-plane">{sendIcon}</span>

      <div className="auth-dashboard-window">
        <div className="auth-window-bar">
          <i />
          <i />
          <i />
          <span />
        </div>
        <div className="auth-window-body">
          <div className="auth-window-nav">
            <b />
            <i />
            <i />
            <i />
          </div>
          <div className="auth-window-table">
            <strong />
            {[0, 1, 2, 3].map((row) => (
              <div className="auth-table-row" key={row}>
                <i />
                <span />
                <span />
                <b data-status={row % 3} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="auth-floating-card auth-floating-card-left">
        {documentIcon}
        <span />
        <b />
      </div>
      <div className="auth-floating-card auth-floating-card-right">
        <div>
          <span />
          <strong>128</strong>
          <b />
        </div>
        {chartIcon}
      </div>
    </div>
  );
}
