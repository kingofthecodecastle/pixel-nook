import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const env = { ...process.env };
if (!env.JAVA_HOME && existsSync('.tools/java')) {
  const jdk = readdirSync('.tools/java').find(name => name.startsWith('jdk-'));
  if (jdk) env.JAVA_HOME = resolve('.tools/java', jdk, 'Contents/Home');
}
if (!env.ANDROID_HOME && existsSync('.tools/android-sdk')) env.ANDROID_HOME = resolve('.tools/android-sdk');
env.GRADLE_USER_HOME ||= resolve('.tools/gradle');
const task = process.argv[2] || 'assembleDebug';
if (!['assembleDebug', 'bundleRelease'].includes(task)) throw new Error('Unknown Android build task');
const result = spawnSync(resolve(root, 'android/gradlew'), ['-p', 'android', task, '--no-daemon', '--max-workers=2'], { env, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
