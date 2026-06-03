import { httpsUrlOrNull } from './safe-url.js';

// Maps a backend verify result to a pure display model. Drives the verify UI
// from the REAL verdict (no hardcoded "authentic") and renders the DeDi entity
// link only when it is a safe https URL (M3).
const VERDICTS = {
  authentic: { icon: 'check', title: 'Authentic', tone: 'success' },
  tampered: { icon: 'cross', title: 'Tampered', tone: 'error' },
  forged: { icon: 'cross', title: 'Forged', tone: 'error' },
  untrusted: { icon: 'warn', title: 'Untrusted signer', tone: 'warning' },
  unsigned: { icon: 'info', title: 'Not signed', tone: 'neutral' },
  unknown: { icon: 'info', title: 'Unknown', tone: 'neutral' },
};

export function toDisplayModel(result) {
  const verdict = (result && result.verdict) || 'unknown';
  const meta = VERDICTS[verdict] || VERDICTS.unknown;
  const entity = (result && result.entity) || null;
  return {
    verdict,
    icon: meta.icon,
    title: meta.title,
    tone: meta.tone,
    entityName: (entity && entity.name) || null,
    entityUrl: httpsUrlOrNull(entity && entity.url),
  };
}

// Maps an in-browser c2pa-web read (no upload) to a display model for the
// public verify path (H2). The browser can prove content integrity + that the
// file is signed, but NOT that the signer is genuine — the forgery-proof key
// check vs DeDi is an explicit server step (canConfirm drives that button).
export function toBrowserModel(read) {
  if (!read || read.error) {
    return { verdict: 'unknown', icon: 'info', title: "Couldn't read in your browser", tone: 'neutral', canConfirm: true };
  }
  if (!read.hasManifest) {
    return { verdict: 'unsigned', icon: 'info', title: 'Not signed', tone: 'neutral', canConfirm: false };
  }
  if (read.state === 'Invalid') {
    return { verdict: 'tampered', icon: 'cross', title: 'Content modified', tone: 'error', canConfirm: false };
  }
  return { verdict: 'signed', icon: 'check', title: 'Content intact · signed', tone: 'success', canConfirm: true };
}
