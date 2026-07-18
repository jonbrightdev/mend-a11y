import type { Settings } from '../../lib/types';
import { Modal, Segment, Switch, TextField } from '../components/Controls';

export function SettingsScreen({
  settings,
  onChange,
  onClose,
  allSites,
  onToggleAllSites,
  closing,
}: {
  settings: Settings;
  onChange: (next: Settings) => void;
  onClose: () => void;
  allSites: boolean;
  onToggleAllSites: (next: boolean) => void;
  closing?: boolean;
}) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]): void =>
    onChange({ ...settings, [key]: value });

  return (
    <Modal title="Settings" onClose={onClose} closing={closing}>
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
      <Segment
        label="Highlight style"
        value={settings.highlightStyle}
        onChange={(v) => set('highlightStyle', v)}
        options={[
          { value: 'outline', label: 'Outline' },
          { value: 'overlay', label: 'Overlay' },
        ]}
      />
      <Switch
        name="Access all sites"
        desc="Audit any tab without invoking Mend on each one. Off by default; nothing leaves your machine either way."
        checked={allSites}
        onChange={onToggleAllSites}
      />
      <TextField
        label="Dashboard API key"
        type="password"
        value={settings.dashboardApiKey}
        placeholder="mend_…"
        desc="Optional. Generate one on your mend-a11y.com account page to enable saving audits there. Audits are only sent when you press Save on a result — never automatically."
        onChange={(v) => set('dashboardApiKey', v)}
      />
    </Modal>
  );
}
