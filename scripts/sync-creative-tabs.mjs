import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { delimiter, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { normalizeCreativeTabs } from './lib/creative-tabs.mjs';

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = resolve(root, 'build/creative');
const cache = resolve(root, 'build/cache');
await Promise.all([mkdir(work, { recursive: true }), mkdir(cache, { recursive: true })]);
const lock = JSON.parse(
  await readFile(resolve(root, 'scripts/creative-sources.lock.json'), 'utf8'),
);
const digest = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');

async function download(artifact) {
  const path = resolve(cache, digest(artifact.url));
  let bytes;
  try {
    bytes = await readFile(path);
  } catch {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const response = await fetch(artifact.url, { signal: AbortSignal.timeout(180_000) });
        if (!response.ok) throw new Error(`${response.status} ${artifact.url}`);
        bytes = Buffer.from(await response.arrayBuffer());
        break;
      } catch (error) {
        if (attempt === 3) throw error;
      }
    }
  }
  const algorithm = artifact.sha256 ? 'sha256' : 'sha1';
  if (digest(bytes, algorithm) !== artifact[algorithm]) {
    throw new Error(`Checksum mismatch: ${artifact.url}`);
  }
  await writeFile(path, bytes);
  return bytes;
}

async function javaHome() {
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME;
  const jdk = lock.isolatedJdk[`${process.platform}-${process.arch}`];
  if (!jdk) throw new Error(`Set JAVA_HOME to a Java ${lock.javaMajor} JDK on this platform.`);
  const directory = resolve(root, 'build/creative-jdk');
  const home = resolve(directory, jdk.home);
  try {
    await access(resolve(home, 'bin/javac'));
  } catch {
    console.log(`Caching isolated JDK ${jdk.version}; no global installation`);
    const archive = resolve(work, 'jdk.tar.gz');
    await writeFile(archive, await download(jdk));
    await mkdir(directory, { recursive: true });
    await exec('tar', ['-xzf', archive, '-C', directory, '--strip-components=1'], {
      cwd: work,
      timeout: 120_000,
    });
  }
  return home;
}

const home = await javaHome();
const java = resolve(home, 'bin/java');
const javac = resolve(home, 'bin/javac');
const { stdout: javaVersion } = await exec(java, ['--version'], { cwd: work, timeout: 10_000 });
if (!new RegExp(`^(?:openjdk|java) ${lock.javaMajor}[. ]`).test(javaVersion)) {
  throw new Error(`Expected Java ${lock.javaMajor}, found ${javaVersion.split('\n')[0]}`);
}
const source = resolve(root, 'scripts/java/CreativeDump.java');
const sourceBytes = await readFile(source);
const inputHash = digest(JSON.stringify(lock) + digest(sourceBytes) + javaVersion);
const nativePath = resolve(cache, `creative-native-${inputHash}.json`);
let native;
try {
  native = JSON.parse(await readFile(nativePath, 'utf8'));
  console.log('Using cached native creative-tab oracle', inputHash);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const metadata = JSON.parse((await download(lock.versionMetadata)).toString());
  if (metadata.id !== lock.version || metadata.downloads.client.sha1 !== lock.client.sha1) {
    throw new Error('Pinned Minecraft version metadata disagrees with client lock');
  }
  const client = resolve(work, `client-${lock.client.sha1}.jar`);
  await writeFile(client, await download(lock.client));
  const libraryDirectory = resolve(work, 'libraries');
  await mkdir(libraryDirectory, { recursive: true });
  // The headless registry generator needs Java artifacts, never native graphics libraries.
  const libraries = metadata.libraries.filter(
    (lib) => lib.downloads?.artifact && !lib.name.includes('natives-'),
  );
  const paths = new Array(libraries.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (cursor < libraries.length) {
        const index = cursor++;
        const artifact = libraries[index].downloads.artifact;
        const destination = resolve(libraryDirectory, `${artifact.sha1}.jar`);
        await writeFile(destination, await download(artifact));
        paths[index] = destination;
      }
    }),
  );
  const classes = resolve(work, `classes-${digest(sourceBytes)}`);
  await mkdir(classes, { recursive: true });
  const classpath = [client, ...paths].join(delimiter);
  await exec(javac, ['-cp', classpath, '-d', classes, source], {
    cwd: work,
    timeout: 60_000,
  });
  console.log('Running vanilla creative-tab oracle', lock.version);
  const { stderr } = await exec(
    java,
    ['-Xmx768m', '-cp', [classes, classpath].join(delimiter), 'CreativeDump', nativePath],
    {
      cwd: work,
      timeout: 120_000,
      maxBuffer: 2 * 1024 * 1024,
    },
  );
  if (stderr.trim()) console.warn(stderr.trim());
  native = JSON.parse(await readFile(nativePath, 'utf8'));
}
if (native.version !== lock.version) throw new Error('Native creative export version mismatch');
const catalogue = JSON.parse(await readFile(resolve(root, 'src/data/catalogue.json'), 'utf8'));
const { data, audit } = normalizeCreativeTabs(native, catalogue);
const manifest = {
  ...audit,
  sources: lock,
  exporterSha256: digest(sourceBytes),
  nativeMetadataSha256: digest(JSON.stringify(native)),
  creativeTabsSha256: digest(JSON.stringify(data)),
};
const formatting = { ...(await resolveConfig(root)), parser: 'json' };
await writeFile(
  resolve(root, 'src/data/creative-tabs.json'),
  await format(JSON.stringify(data), formatting),
);
await writeFile(
  resolve(root, 'src/data/creative-source-manifest.json'),
  await format(JSON.stringify(manifest), formatting),
);
console.log('Creative inventory complete', {
  tabs: data.tabs.length,
  items: data.search.length,
  overlappingItems: audit.overlappingItems,
  excludedComponentStacks: audit.excludedComponentStacks,
});
