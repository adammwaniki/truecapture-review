// TrueCapture popup — settings + launch the capture tab.
// Capture/recording happens in capture.html (extension tabs have camera/mic
// permission; popups do not), so the popup only stores the backend URL and
// opens the capture tab.

const BACKEND_DEFAULT = 'https://api.truecapture.global';
let backendUrl = BACKEND_DEFAULT;

async function loadSettings() {
  const stored = await chrome.storage.local.get(['backendUrl']);
  backendUrl = stored.backendUrl || BACKEND_DEFAULT;
  document.getElementById('backend-url').value = backendUrl;
}

document.getElementById('btn-save-url').addEventListener('click', async () => {
  const val = document.getElementById('backend-url').value.trim().replace(/\/$/, '');
  backendUrl = val || BACKEND_DEFAULT;
  await chrome.storage.local.set({ backendUrl });
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
