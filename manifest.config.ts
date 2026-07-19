import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

export default defineManifest({
  manifest_version: 3,
  name: 'Mend: Accessibility Audit',
  version: pkg.version,
  description: 'Find accessibility issues on the active page and learn how to fix them.',
  // No `key` field. The Chrome Web Store assigns and manages this item's
  // identity (id and signing key) itself; embedding our own key makes the
  // uploaded package mismatch the published item, and the upload is rejected
  // with "key field value doesn't match the current item". A `key` is only
  // useful for self-distributed .crx files or a stable unpacked-dev id, neither
  // of which we depend on now that the store is the distribution channel.
  // No host_permissions beyond one narrow content script (below). Mend uses
  // activeTab for the page it's invoked on, and never has standing access to
  // any site the user browses — except its own companion dashboard, where a
  // content script relays a freshly generated API key into extension storage
  // so the user doesn't have to copy/paste it. That script runs only on the
  // dashboard's own account page and does nothing else.
  permissions: ['activeTab', 'scripting', 'storage', 'sidePanel'],
  content_scripts: [
    {
      matches: ['https://mend-a11y.com/account*'],
      js: ['src/content/dashboard-key-relay.ts'],
      run_at: 'document_idle',
    },
  ],
  // Optional, opt-in only. The user can grant access to all sites from inside
  // the panel so several tabs can be audited without re-invoking on each. This
  // is requested at runtime with an explicit Chrome consent prompt, so there is
  // no broad-permission warning at install.
  optional_host_permissions: ['<all_urls>'],
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
  commands: {
    _execute_action: {
      suggested_key: { default: 'Ctrl+Shift+A', mac: 'Command+Shift+A' },
      description: 'Open the Mend side panel',
    },
  },
  // The engine is injected into the page's MAIN world via executeScript({ files }),
  // which requires it to be web-accessible. Under activeTab the script only loads
  // on a tab the user has invoked Mend on.
  web_accessible_resources: [
    {
      matches: ['<all_urls>'],
      resources: ['vendor/axe.min.js'],
      use_dynamic_url: false,
    },
  ],
});
