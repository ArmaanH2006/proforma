import type { ReactNode } from 'react';
import type { Issue, Level, Source } from '../engine';
import { Icon, type IconName } from './Icon';

export function Panel({
  title,
  description,
  actions,
  children,
  footer,
  flush,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  flush?: boolean;
  className?: string;
}) {
  return (
    <section className={`panel ${className ?? ''}`}>
      {(title || actions) && (
        <header className="panel-header">
          <div className="panel-title">
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {actions && <div className="panel-actions">{actions}</div>}
        </header>
      )}
      <div className={`panel-body ${flush ? 'flush' : ''}`}>{children}</div>
      {footer && <footer className="panel-footer">{footer}</footer>}
    </section>
  );
}

export function Stats({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="stats" role="group" aria-label={label}>
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  emphasis,
  title,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  emphasis?: boolean;
  title?: string;
}) {
  return (
    <div className={`stat ${emphasis ? 'emphasis' : ''}`} title={title}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub != null && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

const LEVEL_META: Record<Level | 'info' | 'na', { cls: string; icon: IconName; text: string }> = {
  strong: { cls: 'good', icon: 'check', text: 'Strong' },
  ok: { cls: '', icon: 'minus', text: 'On par' },
  weak: { cls: 'warn', icon: 'alert', text: 'Weak' },
  poor: { cls: 'bad', icon: 'x', text: 'Concern' },
  info: { cls: '', icon: 'info', text: 'Info only' },
  na: { cls: '', icon: 'minus', text: 'Needs data' },
};

export function LevelBadge({ level }: { level: Level | 'info' | 'na' }) {
  const meta = LEVEL_META[level];
  return (
    <span className={`badge ${meta.cls}`}>
      <Icon name={meta.icon} />
      {meta.text}
    </span>
  );
}

export function Badge({
  tone,
  icon,
  children,
}: {
  tone?: 'good' | 'warn' | 'bad' | 'accent';
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <span className={`badge ${tone ?? ''}`}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

export function Issues({ issues }: { issues: readonly Issue[] }) {
  if (!issues.length) return null;
  return (
    <div className="stack" style={{ gap: 8 }}>
      {issues.map((issue, i) => (
        <div
          key={i}
          className={`callout ${issue.level}`}
          role={issue.level === 'error' ? 'alert' : 'status'}
        >
          <Icon name={issue.level === 'error' ? 'alert' : 'info'} />
          <span>{issue.message}</span>
        </div>
      ))}
    </div>
  );
}

export function Note({ children, icon = 'info' }: { children: ReactNode; icon?: IconName }) {
  return (
    <div className="callout info">
      <Icon name={icon} />
      <span>{children}</span>
    </div>
  );
}

export function SourceLink({ source, short }: { source: Source; short?: boolean }) {
  const text = short ? `Source: ${source.short ?? source.label}` : source.label;
  if (!source.url) return <span className="source">{text}</span>;
  return (
    <span className="source">
      <a href={source.url} target="_blank" rel="noreferrer" title={source.label}>
        {text}
      </a>
    </span>
  );
}

export function Explainer({
  title,
  children,
  defaultOpen,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="explainer" open={defaultOpen}>
      <summary>{title}</summary>
      <div className="explainer-body">{children}</div>
    </details>
  );
}
