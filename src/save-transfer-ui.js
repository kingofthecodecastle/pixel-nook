import { Capacitor } from '@capacitor/core';
import { exportSave, importSave, exportRecoverySave, listRecoverySaves } from './save-transfer.js';

async function saveFile(text, name) {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: 'Pixel Nook save', dialogTitle: 'Save your Pixel Nook progress', files: [uri] });
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** A transfer is always initiated by a visible user action; opening is read-only. */
export function openSaveTransfer({ openModal, flushStorage = async () => true, onImported = () => {} }) {
  const modal = openModal(`
    <p class="info-kicker">YOUR ARCADE SAVE</p>
    <h2 class="info-title">SAVE & TRANSFER</h2>
    <p class="save-help">Keep your scores, coins, badges, daily challenges and settings. To move from the website to the app, export here in your original browser, then import in the app.</p>
    <div class="save-actions"><button type="button" class="btn chunky small" id="saveExport">EXPORT SAVE</button><button type="button" class="btn chunky small" id="saveCopy">COPY TEXT</button></div>
    <label class="save-label" for="saveText">Save text — paste a save here, or export to fill this box</label>
    <textarea id="saveText" class="save-text" rows="6" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="Paste Pixel Nook save JSON"></textarea>
    <label class="save-label" for="saveFile">Or open a save file</label>
    <input id="saveFile" type="file" accept=".json,application/json,text/plain" />
    <p class="save-help">Import merges both saves. Scores and unlocked items are kept; coin balances use the higher value, never a sum. Existing initials and settings on this device stay selected. A recovery copy of both saves is kept before every change.</p>
    <div class="save-actions"><button type="button" class="btn chunky small" id="saveImport">IMPORT & RELOAD</button><button type="button" class="btn chunky small" id="saveRetry" hidden>RETRY BACKUP & RELOAD</button></div>
    <p id="saveStatus" class="save-status" role="status" aria-live="polite"></p>
    <details class="save-recovery"><summary>Recovery copies</summary><p class="save-help">Export the exact save from before an import, or the incoming save. These copies stay on this device; export them somewhere safe before uninstalling.</p>
      <label class="save-label" for="saveRecovery">Choose a recovery copy</label><select id="saveRecovery"></select>
      <div class="save-actions"><button type="button" class="btn chunky small" id="saveRecoveryBefore">EXPORT BEFORE IMPORT</button><button type="button" class="btn chunky small" id="saveRecoveryIncoming">EXPORT INCOMING SAVE</button></div>
    </details>
  `, { cls: 'wide save-panel', label: 'Save & transfer', pause: true });
  const query = (selector) => modal.querySelector(selector);
  const text = query('#saveText');
  const status = query('#saveStatus');
  const retry = query('#saveRetry');
  const recovery = query('#saveRecovery');
  let busy = false;
  let imported = false;

  function report(message, error = false) {
    status.textContent = message;
    status.classList.toggle('error', error);
  }

  function refreshRecovery() {
    const keys = listRecoverySaves().reverse();
    recovery.replaceChildren();
    keys.forEach((key, index) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = `Recovery copy ${keys.length - index}${index === 0 ? ' (latest)' : ''}`;
      recovery.appendChild(option);
    });
    if (!keys.length) {
      const option = document.createElement('option');
      option.textContent = 'No imports on this device yet';
      recovery.appendChild(option);
    }
    recovery.disabled = !keys.length;
    query('#saveRecoveryBefore').disabled = !keys.length;
    query('#saveRecoveryIncoming').disabled = !keys.length;
  }

  async function run(action) {
    if (busy) return;
    busy = true;
    query('#saveImport').disabled = true;
    try { await action(); }
    catch (error) { report(error?.message || 'The save action could not be completed. Your current save is kept.', true); }
    finally { busy = false; query('#saveImport').disabled = imported; }
  }

  async function finishImport() {
    let flushed = false;
    try { flushed = await flushStorage(); } catch { /* Preserve the local save and show recovery controls. */ }
    if (flushed !== true) {
      retry.hidden = false;
      report('The merged save is stored locally, but its native backup is not confirmed. Export your save now, then use RETRY BACKUP & RELOAD. No reload has happened.', true);
      return;
    }
    report('Save merged and backed up. Reloading your arcade…');
    location.reload();
  }

  const filename = (suffix = '') => `pixel-nook-save${suffix}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  query('#saveExport').addEventListener('click', () => run(async () => {
    text.value = exportSave();
    report('Your save text is ready below. Save the file or keep a copy of this text.');
    await saveFile(text.value, filename());
  }));
  query('#saveCopy').addEventListener('click', () => run(async () => {
    if (!text.value.trim()) text.value = exportSave();
    try {
      await navigator.clipboard.writeText(text.value);
      report('Save text copied. Keep it somewhere safe before uninstalling or changing devices.');
    } catch {
      text.focus();
      text.select();
      report('Save text selected. Use your device’s Copy command to keep a copy.');
    }
  }));
  query('#saveFile').addEventListener('change', (event) => run(async () => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) throw new Error('Choose a Pixel Nook save smaller than 2 MB.');
    text.value = await file.text();
    report('File loaded. Nothing has changed yet. Choose IMPORT & RELOAD to merge it.');
  }));
  query('#saveImport').addEventListener('click', () => run(async () => {
    if (imported) return;
    const result = importSave(text.value);
    imported = true;
    onImported();
    refreshRecovery();
    report(result.changed ? 'Save merged. Confirming its backup…' : 'This save is already present. Confirming its backup…');
    await finishImport();
  }));
  retry.addEventListener('click', () => run(finishImport));
  for (const [button, source] of [['#saveRecoveryBefore', 'before'], ['#saveRecoveryIncoming', 'incoming']]) {
    query(button).addEventListener('click', () => run(async () => {
      text.value = exportRecoverySave(recovery.value, { source });
      report('Recovery save is ready below. Save the file or copy its text; your current progress has not changed.');
      await saveFile(text.value, filename(`-${source}`));
    }));
  }
  try { refreshRecovery(); }
  catch { report('Device storage is unavailable. Existing saves have not been changed.', true); }
  return modal;
}
