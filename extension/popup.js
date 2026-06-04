// TrueCapture popup — settings + launch the capture tab.
// Capture/recording happens in capture.html (extension tabs have camera/mic
// permission; popups do not), so the popup only stores the backend URL and
// opens the capture tab.

const BACKEND_DEFAULT = 'https://api.truecapture.global';
const WEB_DEFAULT = 'https://www.truecapture.global';
let backendUrl = BACKEND_DEFAULT;
let webUrl = WEB_DEFAULT;

async function loadSettings() {
  const stored = await chrome.storage.local.get(['backendUrl', 'webUrl']);
  backendUrl = stored.backendUrl || BACKEND_DEFAULT;
  webUrl = stored.webUrl || WEB_DEFAULT;
  document.getElementById('backend-url').value = backendUrl;
  document.getElementById('web-url').value = webUrl;
}

document.getElementById('btn-save-url').addEventListener('click', async () => {
  const beVal = document.getElementById('backend-url').value.trim().replace(/\/$/, '');
  const webVal = document.getElementById('web-url').value.trim().replace(/\/$/, '');
  backendUrl = beVal || BACKEND_DEFAULT;
  webUrl = webVal || WEB_DEFAULT;
  await chrome.storage.local.set({ backendUrl, webUrl });
  document.getElementById('btn-save-url').textContent = 'Saved!';
  setTimeout(() => (document.getElementById('btn-save-url').textContent = 'Save'), 1200);
});

// ── Photo / Webcam / Screen → open capture tab ───────────────────
function openCaptureTab(mode) {
  chrome.tabs.create({ url: chrome.runtime.getURL(`capture.html?mode=${mode}`) });
  window.close();
}

document.getElementById('btn-photo').addEventListener('click', () => openCaptureTab('photo'));
document.getElementById('btn-webcam').addEventListener('click', () => openCaptureTab('webcam'));
document.getElementById('btn-screen').addEventListener('click', () => openCaptureTab('screen'));

loadSettings();
