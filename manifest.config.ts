import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

export default defineManifest({
  manifest_version: 3,
  name: 'Mend: Accessibility Audit',
  version: pkg.version,
  description: 'Find accessibility issues on the active page and learn how to fix them.',
  // Public signing key. Gives a stable extension id when loaded unpacked in
  // development. Safe to commit (it is a public key). The matching private key
  // (key.pem) is NOT committed. The Chrome Web Store assigns the production id
  // independently when the listing is created.
  key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA4IcddEMgWoQr+KTDKkF1oHTtDqe6S//rLuhBdTSew1b/L1PcJQr0nGrmOStnh5LQoX7MKWo/oZRaGs+KW5lS4385rYk4JfvvULi6uWCWqhrrs3R+QygEILHbfUeDk3Zfz0j/fbcVdi2MrsKD89w4Na0Y56iCOXxxbofiZmwGpELRtLcRZk2QSYnhEi7ryFXaVRIJ12a3fpwwLgpvCT0oYRXl4khyYqXBCNc38UGPLNf8H1ozPbdGBnHSIFzWnP1DOTOQjuY1lt9b9oRVpKfeDjkbqmj2NpVNLdhgzPqF8NNBl8YZDo2Uw+cwNXRhbO96j6X+d1rKU6OB71Do4xYB6QIDAQAB',
  // No host_permissions. Mend uses activeTab, so it has access to a page only
  // when the user invokes it, and never any standing access to any site.
  permissions: ['activeTab', 'scripting', 'storage', 'sidePanel'],
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
