import { useId, useState, type ReactNode } from 'react';
import { editText, parseField, type NumberKind } from '../lib/parse';

const AFFIX: Partial<Record<NumberKind, { before?: string; after?: string }>> = {
  money: { before: '$' },
  price: { before: '$' },
  percent: { after: '%' },
  multiple: { after: 'x' },
  months: { after: 'mo' },
  years: { after: 'yrs' },
};

const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

function display(value: number | null, kind: NumberKind): string {
  if (value == null || !Number.isFinite(value)) return '';
  switch (kind) {
    case 'percent':
      return grouped.format(Math.round(value * 1e4) / 1e2);
    case 'price':
      return value.toFixed(4);
    case 'shares':
      return grouped.format(Math.round(value));
    case 'year':
      return String(Math.round(value));
    default:
      return grouped.format(value);
  }
}

interface NumberFieldProps {
  label?: ReactNode;
  value: number | null;
  onChange: (value: number | null) => void;
  kind?: NumberKind;
  hint?: ReactNode;
  aside?: ReactNode;
  placeholder?: string;
  min?: number;
  max?: number;
  /** Allow clearing the field to null. */
  optional?: boolean;
  className?: string;
  ariaLabel?: string;
  id?: string;
}

/**
 * Number input that accepts shorthand ("1.5m", "$250k", "12%") and shows a
 * formatted value when not focused. Commits on blur or Enter; Escape cancels.
 */
export function NumberField({
  label,
  value,
  onChange,
  kind = 'number',
  hint,
  aside,
  placeholder,
  min,
  max,
  optional = false,
  className,
  ariaLabel,
  id,
}: NumberFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const affix = AFFIX[kind] ?? {};

  const commit = () => {
    if (draft == null) return;
    const parsed = parseField(draft, kind);
    if (parsed == null) {
      if (optional) {
        onChange(null);
        setError(null);
        setDraft(null);
      } else {
        setError('Enter a number.');
      }
      return;
    }
    if (Number.isNaN(parsed)) {
      setError('Use a number like 1.5m, 250k, or 12.');
      return;
    }
    let v = parsed;
    if (min != null && v < min) v = min;
    if (max != null && v > max) v = max;
    setError(null);
    setDraft(null);
    if (v !== value) onChange(v);
  };

  const control = (
    <div className="control" data-invalid={error ? 'true' : undefined}>
      {affix.before && <span className="affix">{affix.before}</span>}
      <input
        id={inputId}
        className="num"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        aria-label={ariaLabel}
        aria-invalid={error ? true : undefined}
        placeholder={placeholder ?? (optional ? '—' : undefined)}
        value={draft ?? display(value, kind)}
        onFocus={(e) => {
          setDraft(editText(value, kind));
          const el = e.currentTarget;
          requestAnimationFrame(() => el.select());
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          if (error) setError(null);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'Escape') {
            setDraft(null);
            setError(null);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {affix.after && <span className="affix after">{affix.after}</span>}
    </div>
  );

  if (!label) return <div className={className}>{control}</div>;
  return (
    <div className={`field ${className ?? ''}`}>
      <label className="field-label" htmlFor={inputId}>
        <span>{label}</span>
        {aside && <span className="aside">{aside}</span>}
      </label>
      {control}
      {error ? (
        <span className="field-error">{error}</span>
      ) : hint ? (
        <span className="field-hint">{hint}</span>
      ) : null}
    </div>
  );
}

interface TextFieldProps {
  label?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: ReactNode;
  className?: string;
  ariaLabel?: string;
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  className,
  ariaLabel,
}: TextFieldProps) {
  const id = useId();
  return (
    <div className={`field ${className ?? ''}`}>
      {label && (
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
      )}
      <div className="control">
        <input
          id={id}
          value={value}
          placeholder={placeholder}
          aria-label={ariaLabel}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

interface TextAreaProps extends TextFieldProps {
  rows?: number;
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  hint,
  className,
  rows = 3,
  ariaLabel,
}: TextAreaProps) {
  const id = useId();
  return (
    <div className={`field ${className ?? ''}`}>
      {label && (
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
      )}
      <textarea
        id={id}
        className="textarea"
        rows={rows}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

interface SelectFieldProps<T extends string> {
  label?: ReactNode;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  hint?: ReactNode;
  className?: string;
  ariaLabel?: string;
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
  className,
  ariaLabel,
}: SelectFieldProps<T>) {
  const id = useId();
  return (
    <div className={`field ${className ?? ''}`}>
      {label && (
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
      )}
      <div className="control">
        <select
          id={id}
          value={value}
          aria-label={ariaLabel}
          onChange={(e) => onChange(e.target.value as T)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}
