// Optional all-sites access. Mend works on a single tab via activeTab without
// this; granting it lets the user audit several tabs without invoking Mend on
// each one. chrome.permissions.request must be called from a user gesture, so
// it is wired to a button in the panel, not called automatically.

const ALL_SITES: chrome.permissions.Permissions = { origins: ['<all_urls>'] };

export async function hasAllSitesAccess(): Promise<boolean> {
  try {
    return await chrome.permissions.contains(ALL_SITES);
  } catch {
    return false;
  }
}

/** Must be called synchronously from a user gesture (e.g. a click handler). */
export async function requestAllSitesAccess(): Promise<boolean> {
  try {
    return await chrome.permissions.request(ALL_SITES);
  } catch {
    return false;
  }
}

export async function revokeAllSitesAccess(): Promise<boolean> {
  try {
    return await chrome.permissions.remove(ALL_SITES);
  } catch {
    return false;
  }
}
