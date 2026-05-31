import type { ComponentChildren } from 'preact';
import { useFocusTrap } from '../hooks/a11y';
import { CloseIcon } from './Icon';

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  footer?: ComponentChildren;
}) {
  const ref = useFocusTrap<HTMLDivElement>(true, onClose);
  return (
    <div class="modal-backdrop" onClick={onClose}>
      <div
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <div class="modal-head">
          <h2>{title}</h2>
          <button class="icon-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div class="modal-body">{children}</div>
        {footer && <div class="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Segment<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div class="field">
      <span class="field-label">{label}</span>
      <div class="segment" role="radiogroup" aria-label={label}>
        {options.map((opt) => (
          <button
            key={opt.value}
            class="seg"
            role="radio"
            aria-checked={value === opt.value}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Switch({
  name,
  desc,
  checked,
  onChange,
}: {
  name: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div class="field">
      <div class="switch-row">
        <div class="switch-text">
          <div class="switch-name">{name}</div>
          {desc && <div class="switch-desc">{desc}</div>}
        </div>
        <button
          class="switch"
          role="switch"
          aria-checked={checked}
          aria-label={name}
          onClick={() => onChange(!checked)}
        >
          <span class="knob" />
        </button>
      </div>
    </div>
  );
}

export function RadioList<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div class="field">
      <span class="field-label">{label}</span>
      <div class="radio-list" role="radiogroup" aria-label={label}>
        {options.map((opt) => (
          <button
            key={opt.value}
            class="radio-item"
            role="radio"
            aria-checked={value === opt.value}
            onClick={() => onChange(opt.value)}
          >
            <span class="radio-mark" />
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
