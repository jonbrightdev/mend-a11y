import { Modal, RadioList } from '../components/Controls';
import { VISION_LABELS, VISION_MODES, type VisionMode } from '../../lib/vision';

type Choice = VisionMode | 'off';

/**
 * Vision-simulation chooser. Unlike the on/off helpers this offers several
 * modes, so it is a RadioList (color-vision deficiencies plus low vision, with
 * an explicit Off) rather than a toggle. Selecting a mode applies it to the page
 * immediately via onApply, so the sheet doubles as a live preview while the user
 * compares modes.
 */
export function VisionScreen({
  mode,
  onApply,
  onClose,
  closing,
}: {
  mode: VisionMode | null;
  onApply: (mode: VisionMode | null) => void;
  onClose: () => void;
  closing?: boolean;
}) {
  const value: Choice = mode ?? 'off';
  const options: { value: Choice; label: string }[] = [
    { value: 'off', label: 'Off (no simulation)' },
    ...VISION_MODES.map((m) => ({ value: m as Choice, label: VISION_LABELS[m] })),
  ];

  return (
    <Modal title="Vision simulation" onClose={onClose} closing={closing}>
      <p class="vision-intro">
        Apply a full-page filter that approximates how this page looks with a
        color-vision deficiency or low vision. Pick a mode to apply it instantly.
      </p>
      <RadioList<Choice>
        label="Simulate"
        value={value}
        options={options}
        onChange={(v) => onApply(v === 'off' ? null : v)}
      />
      <p class="outline-note warn vision-caveat">
        Whole-page filters are heavy and can affect fixed or sticky elements. This
        is a visual aid for spotting problems, not a pass or fail verdict.
      </p>
    </Modal>
  );
}
