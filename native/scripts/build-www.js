/* builds www/ for the iOS app from the web app source.
   the app runs from files inside the bundle (no website loading), without the service worker,
   plus a small native layer (share sheet, post reminders, haptics, status bar). */
const fs = require('fs'), path = require('path');
const SRC = path.resolve(process.env.PT_SRC || path.join(__dirname, '..', '..'));
const OUT = path.join(__dirname, '..', 'www');
const SKIP = new Set(['sw.js', 'CNAME', 'email', '.git', '.github', '.nojekyll', 'node_modules', 'native']);
fs.rmSync(OUT, { recursive: true, force: true });
function copy(a, b){ const st = fs.statSync(a);
  if (st.isDirectory()){ fs.mkdirSync(b, { recursive: true }); for (const f of fs.readdirSync(a)) if (!SKIP.has(f)) copy(path.join(a, f), path.join(b, f)); }
  else fs.copyFileSync(a, b); }
copy(SRC, OUT);
const nm = p => path.join(__dirname, '..', 'node_modules', p);
const vend = path.join(OUT, 'vendor', 'cap'); fs.mkdirSync(vend, { recursive: true });
const plugins = { core: '@capacitor/core/dist/capacitor.js', share: '@capacitor/share/dist/plugin.js', synapse: '@capacitor/synapse/dist/synapse.js', fs: '@capacitor/filesystem/dist/plugin.js',
  notify: '@capacitor/local-notifications/dist/plugin.js', haptics: '@capacitor/haptics/dist/plugin.js', statusbar: '@capacitor/status-bar/dist/plugin.js',
  splash: '@capacitor/splash-screen/dist/plugin.js', app: '@capacitor/app/dist/plugin.js' };
const tags = [];
for (const [k, p] of Object.entries(plugins)){ fs.copyFileSync(nm(p), path.join(vend, k + '.js')); tags.push(`<script src="vendor/cap/${k}.js"></script>`); if (k === 'synapse') tags.push('<script>window.synapse = window.synapse || window.outsystemsSynapse;</script>'); }
fs.copyFileSync(path.join(__dirname, '..', 'native', 'native.js'), path.join(OUT, 'native.js')); tags.push('<script src="native.js"></script>');
let html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
const swStart = html.indexOf("<script>if('serviceWorker' in navigator");
if (swStart < 0) throw new Error('service worker snippet not found');
html = html.slice(0, swStart) + html.slice(html.indexOf('</script>', swStart) + 9);
const at = html.indexOf('<script src="store.js');
if (at < 0) throw new Error('store.js tag not found');
html = html.slice(0, at) + tags.join('') + html.slice(at);
html = html.replace('<html lang="en">', '<html lang="en" class="pt-native">');
fs.writeFileSync(path.join(OUT, 'index.html'), html);
console.log('www built from', SRC, '-', tags.length, 'native scripts');
