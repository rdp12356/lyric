const { execFileSync } = require('node:child_process');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
assert(sdk, 'Set ANDROID_HOME to verify the APK');
const apk = 'android/app/build/outputs/apk/local/debug/app-local-debug.apk';
const manifest = execFileSync(join(sdk, 'build-tools/34.0.0/aapt'), ['dump', 'xmltree', apk, 'AndroidManifest.xml'], {encoding:'utf8'});
for (const name of ['BIND_NOTIFICATION_LISTENER_SERVICE', 'NotificationListenerService', 'LyricNotificationListener']) {
  assert(!manifest.includes(name), `Local APK unexpectedly declares ${name}`);
}
const dex = execFileSync('unzip', ['-p', apk, 'classes*.dex'], {maxBuffer:32 * 1024 * 1024});
for (const name of ['Landroid/service/notification/NotificationListenerService;', 'Lio/github/rdp12356/lyric/LyricNotificationListener;']) {
  assert(!dex.includes(Buffer.from(name)), `Local APK unexpectedly contains ${name}`);
}
console.log('PASS: Local APK has no notification listener declaration, or notification-listener implementation.');
