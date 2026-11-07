import '@fontsource/press-start-2p/latin-400.css';
import { restoreNativeStorage } from './mobile/persistence.js';

// Restore BEFORE progress.js evaluates its cached state. Never change the web origin.
if (await restoreNativeStorage()) {
  await import('./main.js');
} else {
  document.body.style.cssText = 'background:#0b0b12;color:#ffeaa7;padding:32px;font:16px monospace';
  document.querySelector('#app').innerHTML = '<main><h1>PIXEL NOOK</h1><p>Your saved progress could not be read. Nothing has been reset.</p><button id="retryStorage">TRY AGAIN</button></main>';
  document.querySelector('#retryStorage').onclick = () => location.reload();
}
