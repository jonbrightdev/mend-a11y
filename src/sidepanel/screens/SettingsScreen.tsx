import type { Settings } from '../../lib/types';
import { Modal, Segment, Switch } from '../components/Controls';

export function SettingsScreen({
  settings,
  onChange,
  onClose,
}: {
  settings: Settings;
  onChange: (next: Settings) => void;
  onClose: () => void;
}) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]): void =>
    onChange({ ...settings, [key]: value });

  return (
    <Modal title="Settings" onClose={onClose}>
      <Segment
        label="Theme"
        value={settings.theme}
        onChange={(v) => set('theme', v)}
        options={[
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
          { value: 'auto', label: 'Auto' },
        ]}
      />
      <Segment
        label="WCAG version"
        value={settings.wcagVersion}
        onChange={(v) => set('wcagVersion', v)}
        options={[
          { value: '2.0', label: '2.0' },
          { value: '2.1', label: '2.1' },
          { value: '2.2', label: '2.2' },
        ]}
      />
      <Segment
        label="Conformance level"
        value={settings.conformanceLevel}
        onChange={(v) => set('conformanceLevel', v)}
        options={[
          { value: 'A', label: 'A' },
          { value: 'AA', label: 'AA' },
          { value: 'AAA', label: 'AAA' },
        ]}
      />
      <Segment
        label="Thoroughness"
        value={settings.thoroughness}
        onChange={(v) => set('thoroughness', v)}
        options={[
          { value: 'quick', label: 'Quick' },
          { value: 'standard', label: 'Standard' },
          { value: 'deep', label: 'Deep' },
        ]}
      />
      <Switch
        name="Experimental rules"
        desc="Include rules still under development."
        checked={settings.experimentalRules}
        onChange={(v) => set('experimentalRules', v)}
      />
      <Switch
        name="Audit on tab change"
        desc="Re-run automatically when you switch tabs."
        checked={settings.autoAuditOnTabChange}
        onChange={(v) => set('autoAuditOnTabChange', v)}
      />
      <Segment
        label="Highlight style"
        value={settings.highlightStyle}
        onChange={(v) => set('highlightStyle', v)}
        options={[
          { value: 'outline', label: 'Outline' },
          { value: 'overlay', label: 'Overlay' },
        ]}
      />
    </Modal>
  );
}
