import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';

interface SegmentedProps<T extends string> {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  ariaLabel: string;
  fill?: boolean;
}

/** A radio group drawn as a segmented control. Arrow keys move the selection. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  fill,
}: SegmentedProps<T>) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + (e.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length]!;
    onChange(next.value);
    const buttons = (e.currentTarget as HTMLDivElement).querySelectorAll('button');
    buttons[options.indexOf(next)]?.focus();
  };
  return (
    <div
      className={`segmented ${fill ? 'fill' : ''}`}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKey}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ScorePicker({
  value,
  onChange,
  label,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  label: string;
}) {
  return (
    <div className="score-picker" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} of 5`}
          onClick={() => onChange(value === n ? null : n)}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export function Button({
  children,
  icon,
  variant = 'default',
  size = 'md',
  onClick,
  title,
  disabled,
  type = 'button',
  ariaLabel,
}: {
  children?: ReactNode;
  icon?: IconName;
  variant?: 'default' | 'primary' | 'ghost';
  size?: 'md' | 'sm';
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
  ariaLabel?: string;
}) {
  const cls = [
    'btn',
    variant !== 'default' ? `btn-${variant}` : '',
    size === 'sm' ? 'btn-sm' : '',
    !children ? 'btn-icon' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type={type}
      className={cls}
      onClick={onClick}
      title={title}
      disabled={disabled}
      aria-label={ariaLabel ?? title}
    >
      {icon && <Icon name={icon} />}
      {children != null && (icon ? <span className="btn-label">{children}</span> : children)}
    </button>
  );
}

export interface MenuItem {
  label: string;
  description?: string;
  onSelect: () => void;
}

/** A small dropdown menu. Closes on outside click, Escape, or selection. */
export function Menu({
  label,
  icon,
  items,
  align = 'right',
}: {
  label: string;
  icon?: IconName;
  items: Array<MenuItem | 'separator'>;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className="btn btn-ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {icon && <Icon name={icon} />}
        {label}
        <Icon name="chevronDown" />
      </button>
      {open && (
        <div
          className="menu-list"
          role="menu"
          style={align === 'left' ? { left: 0, right: 'auto' } : undefined}
        >
          {items.map((item, i) =>
            item === 'separator' ? (
              <div key={`sep-${i}`} className="menu-sep" role="separator" />
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                <strong>{item.label}</strong>
                {item.description && <span>{item.description}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function Dialog({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('textarea, input, button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  // Portal to <body> so sticky headers and rails (their own stacking contexts) cannot cover it.
  return createPortal(
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="dialog-header">
          <h2>{title}</h2>
          <Button icon="x" variant="ghost" size="sm" title="Close" onClick={onClose} />
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
