import { useState } from 'preact/hooks';
import type { Category, Impact } from '../../lib/types';
import { Modal, RadioList } from '../components/Controls';
import { severityLabel } from '../components/Severity';
import {
  ALL_SEVERITIES,
  ALL_CATEGORIES,
  CATEGORY_LABEL,
  type FilterState,
} from './filterState';

export type { FilterState } from './filterState';

export function FiltersScreen({
  initial,
  onApply,
  onClose,
}: {
  initial: FilterState;
  onApply: (state: FilterState) => void;
  onClose: () => void;
}) {
  const [severities, setSeverities] = useState(new Set(initial.severities));
  const [categories, setCategories] = useState(new Set(initial.categories));
  const [wcagQuery, setWcagQuery] = useState(initial.wcagQuery);
  const [sort, setSort] = useState(initial.sort);

  const toggleSeverity = (s: Impact): void =>
    setSeverities((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });

  const toggleCategory = (c: Category): void =>
    setCategories((prev) => {
      const next = new Set(prev);
      next.has(c) ? next.delete(c) : next.add(c);
      return next;
    });

  return (
    <Modal
      title="Filters"
      onClose={onClose}
      footer={
        <button
          class="btn primary block"
          onClick={() => onApply({ severities, categories, wcagQuery, sort })}
        >
          Apply filters
        </button>
      }
    >
      <div class="field">
        <span class="field-label">Severity</span>
        <div class="chip-row" style={{ padding: 0 }} role="group" aria-label="Severity">
          {ALL_SEVERITIES.map((s) => (
            <button
              key={s}
              class="chip"
              aria-pressed={severities.has(s)}
              onClick={() => toggleSeverity(s)}
            >
              {severityLabel(s)}
            </button>
          ))}
        </div>
      </div>

      <div class="field">
        <span class="field-label">Category</span>
        <div class="chip-row" style={{ padding: 0 }} role="group" aria-label="Category">
          {ALL_CATEGORIES.map((c) => (
            <button
              key={c}
              class="chip"
              aria-pressed={categories.has(c)}
              onClick={() => toggleCategory(c)}
            >
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="wcag-search">
          WCAG criterion
        </label>
        <input
          id="wcag-search"
          class="search-input"
          type="text"
          inputMode="decimal"
          placeholder="e.g. 1.4.3"
          value={wcagQuery}
          onInput={(e) => setWcagQuery((e.target as HTMLInputElement).value)}
        />
      </div>

      <RadioList
        label="Sort order"
        value={sort}
        onChange={setSort}
        options={[
          { value: 'severity', label: 'Severity, then page order' },
          { value: 'page', label: 'Page order' },
          { value: 'rule', label: 'Rule name' },
        ]}
      />
    </Modal>
  );
}

