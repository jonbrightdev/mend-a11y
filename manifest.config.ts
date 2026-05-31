import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

export default defineManifest({
  manifest_version: 3,
  name: 'Mend: Accessibility Audit',
  version: pkg.version,
  description: 'Find accessibility issues on the active page and learn how to fix them.',
  permissions: ['activeTab', 'scripting', 'storage', 'sidePanel'],
  host_permissions: ['<all_urls>'],
  icons: {
    '16': 'public/icons/icon-16.png',
    '32': 'public/icons/icon-32.png',
    '48': 'public/icons/icon-48.png',
    '128': 'public/icons/icon-128.png',
  },
  action: {
    default_title: 'Open Mend',
    default_icon: {
      '16': 'public/icons/icon-16.png',
      '32': 'public/icons/icon-32.png',
    },
  },
  side_panel: { default_path: 'src/sidepanel/index.html' },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/overlay.ts'],
      run_at: 'document_idle',
    },
  ],
  commands: {
    _execute_action: {
      suggested_key: { default: 'Ctrl+Shift+A', mac: 'Command+Shift+A' },
      description: 'Open the Mend side panel',
    },
  },
  // The engine is injected into the page's MAIN world via executeScript({ files }),
  // which requires it to be web-accessible. crxjs merges this with its own entries.
  web_accessible_resources: [
    {
      matches: ['<all_urls>'],
      resources: ['vendor/axe.min.js'],
      use_dynamic_url: false,
    },
  ],
});
