import type { Category, Impact } from '../../lib/types';

export interface FilterState {
  severities: Set<Impact>;
  categories: Set<Category>;
  wcagQuery: string;
  sort: 'severity' | 'page' | 'rule';
}

export const ALL_SEVERITIES: Impact[] = ['critical', 'serious', 'moderate', 'minor'];
export const ALL_CATEGORIES: Category[] = [
  'structure',
  'contrast',
  'forms',
  'keyboard',
  'images',
  'aria',
  'other',
];

export const CATEGORY_LABEL: Record<Category, string> = {
  structure: 'Structure',
  contrast: 'Contrast',
  forms: 'Forms',
  keyboard: 'Keyboard',
  images: 'Images',
  aria: 'ARIA',
  other: 'Other',
};

export function defaultFilters(): FilterState {
  return {
    severities: new Set(ALL_SEVERITIES),
    categories: new Set(ALL_CATEGORIES),
    wcagQuery: '',
    sort: 'severity',
  };
}
