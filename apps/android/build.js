// Builds a signed StreamPlus.apk on this PC (npm run build).
// Needs JDK 21 (Gradle does not run on newer Java) and the Android SDK.
// The signing key is created once in %USERPROFILE%\.streamplus — keep it:
// an update must be signed with the same key or Android refuses to install it.
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const here = __dirname;
const win = process.platform === 'win32';

function findJdk21() {
  if (process.env.JDK21) return process.env.JDK21;
  const roots = ['C:\\Program Files\\Eclipse Adoptium', 'C:\\Program Files\\Java', 'C:\\Program Files\\Microsoft', path.join(os.homedir(), '.jdks')];
  for (const r of roots) {
    if (!fs.existsSync(r)) continue;
    const d = fs.readdirSync(r).filter((n) => /(^|[^0-9])21[.\-]/.test(n)).sort().pop();
    if (d) return path.join(r, d);
  }
  throw new Error('JDK 21 introuvable (définis la variable JDK21).');
}

const env = Object.assign({}, process.env);
env.JAVA_HOME = findJdk21();
env.ANDROID_HOME = env.ANDROID_HOME || path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk');
env.ANDROID_SDK_ROOT = env.ANDROID_HOME;
env.PATH = path.join(env.JAVA_HOME, 'bin') + path.delimiter + env.PATH;

function run(cmd, cwd) {
  console.log('\n> ' + cmd);
  execSync(cmd, { cwd: cwd || here, env, stdio: 'inherit' });
}

// 1. Android project (generated, not committed) + icons.
// Capacitor's CLI run with this Node directly (npx is not always on the PATH).
const cap = JSON.stringify(process.execPath) + ' ' + JSON.stringify(path.join(here, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor'));
if (!fs.existsSync(path.join(here, 'android'))) run(cap + ' add android');
fs.cpSync(path.join(here, 'res'), path.join(here, 'android', 'app', 'src', 'main', 'res'), { recursive: true });
run(cap + ' sync android');

// 2. Release build.
if (!process.env.SKIP_GRADLE) run((win ? 'gradlew.bat'.replace(/^/, '.' + path.sep) : './gradlew') + ' assembleRelease --no-daemon', path.join(here, 'android'));

// 3. Signing key (created once, outside the repo).
const keyDir = path.join(os.homedir(), '.streamplus');
const ks = path.join(keyDir, 'streamplus.p12');
const passFile = path.join(keyDir, 'keystore.pass');
if (!fs.existsSync(ks)) {
  fs.mkdirSync(keyDir, { recursive: true });
  fs.writeFileSync(passFile, crypto.randomBytes(24).toString('base64url'));
  const pass = fs.readFileSync(passFile, 'utf8');
  // Password passed through the environment: never on a command line or in a log.
  const r = require('child_process').spawnSync(path.join(env.JAVA_HOME, 'bin', 'keytool'), ['-genkeypair', '-keystore', ks,
    '-storetype', 'PKCS12', '-alias', 'streamplus', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
    '-dname', 'CN=StreamPlus', '-storepass:env', 'KS_PASS', '-keypass:env', 'KS_PASS'],
    { env: Object.assign({}, env, { KS_PASS: pass }), encoding: 'utf8' });
  if (r.status !== 0) { fs.unlinkSync(passFile); throw new Error('keytool a échoué : ' + (r.stderr || r.stdout || r.error)); }
  console.log('\nClé de signature créée : ' + ks + ' (à garder précieusement)');
}

// 4. Align + sign.
const bt = path.join(env.ANDROID_HOME, 'build-tools');
const btv = fs.readdirSync(bt).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop();
const tool = (n) => JSON.stringify(path.join(bt, btv, n + (win ? (n === 'apksigner' ? '.bat' : '.exe') : '')));
const unsigned = path.join(here, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release-unsigned.apk');
const aligned = path.join(os.tmpdir(), 'streamplus-aligned.apk');
const out = path.join(here, 'StreamPlus.apk');
run(tool('zipalign') + ' -p -f 4 ' + JSON.stringify(unsigned) + ' ' + JSON.stringify(aligned));
env.KS_PASS = fs.readFileSync(passFile, 'utf8');
run(tool('apksigner') + ' sign --ks ' + JSON.stringify(ks) + ' --ks-pass env:KS_PASS --out ' + JSON.stringify(out) + ' ' + JSON.stringify(aligned));
run(tool('apksigner') + ' verify ' + JSON.stringify(out));
fs.unlinkSync(aligned);
console.log('\nAPK prêt : ' + out);
