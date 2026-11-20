import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, appendFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extract } from 'tar';
import { DockerAdapter } from './docker.js';
import { RTCEngineError } from './errors.js';
import { coordinatedEngine, type CoordinatedEngine } from './coordination.js';
import { verifyMavenLock } from './artifacts.js';
import type { Engine } from './types.js';

const maven = 'maven@sha256:781f1da87cd3d142e66e47cc149c4582a652fb7f574648206d1e956170c0dc90';
const projects = {
  regular: { repo: 'calculadora-rtc-regime-regular', revision: '32df7196356e81f2df08e6023fc2b6dbc48036d3', sha: '0fac152ff985a74f3124f3d8968a8f4d29186a849cdab27d8f74b0ff1c15b792', jar: 'api-regime-geral.jar', port: 8080, health: 9101, env: 'VERSAO_OFFLINE_URL' },
  simples: { repo: 'calculadora-rtc-simples-nacional', revision: 'f90b6525e6d5823e784baecfc6fef0ad2f04b74f', sha: 'dce49ddc2bfad9d710dd8006140fa4938699405268a3e7e9fd18ff6c65bdf287', jar: 'api-simples-nacional.jar', port: 8082, health: 9103, env: 'VERSAO_URL' }
} as const;
async function downloadSource(engine: Engine, destination: string): Promise<void> {
  const p = projects[engine];
  let bytes: Buffer;
  try {
    const response = await fetch(`https://codeload.github.com/ReceitaFederal/${p.repo}/tar.gz/${p.revision}`, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const size = Number(response.headers.get('content-length') ?? 0);
    if (size > 50_000_000) throw new Error('Source archive too large');
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 50_000_000) throw new Error('Source archive too large');
  } catch (error) { throw new RTCEngineError(`Could not download official ${engine} source`, { cause: error }); }
  if (createHash('sha256').update(bytes).digest('hex') !== p.sha) throw new RTCEngineError(`Source integrity check failed for ${engine}`);
  const archive = join(destination, 'source.tar.gz');
  await writeFile(archive, bytes); await mkdir(join(destination, 'source'));
  await extract({ file: archive, cwd: join(destination, 'source'), strip: 1, strict: true });
}
async function buildImage(engine: Engine, docker: DockerAdapter): Promise<string> {
  const p = projects[engine]; const tag = `rtc-tax-${engine}:${p.revision.slice(0, 12)}-r7`;
  if (await docker.imageExists(tag)) return tag;
  const temp = await mkdtemp(join(tmpdir(), 'rtc-tax-'));
  try {
    await downloadSource(engine, temp);
    if (engine === 'simples') {
      const reg = join(temp, 'regular'); await mkdir(reg); await downloadSource('regular', reg);
      await cp(join(reg, 'source', 'flyway'), join(temp, 'source', 'flyway'), { recursive: true });
    }
    await appendFile(join(temp, 'source', '.mvn', 'wrapper', 'maven-wrapper.properties'), '\nwrapperSha256Sum=e63a53cfb9c4d291ebe3c2b0edacb7622bbc480326beaa5a0456e412f52f066a\ndistributionSha256Sum=7822eb593d29558d8edf87845a2c47e36e2a89d17a84cd2390824633214ed423\n');
    const manifest = await readFile(fileURLToPath(new URL('../assets/maven-artifacts.sha256', import.meta.url)));
    verifyMavenLock(manifest);
    await writeFile(join(temp, 'maven-artifacts.sha256'), manifest);
    await cp(fileURLToPath(new URL('../assets/fetch-maven-artifacts.sh', import.meta.url)), join(temp, 'fetch-maven-artifacts.sh'));
    const recipe = `FROM ${maven} AS java\nARG TARGETARCH\nRUN set -eu; case "$TARGETARCH" in arm64) arch=aarch64; hash=0501ef55ea9ec19b14987def7a73e044cd1748f7f3b97237b49007d387a84a1a;; amd64) arch=x64; hash=dbd75c6332ad995d20b6e25624b84652ef332d6babee4e9ddac3f36ee38d57be;; *) echo "Unsupported Docker architecture: $TARGETARCH" >&2; exit 1;; esac; curl -fsSL --retry 3 "https://github.com/adoptium/temurin25-binaries/releases/download/jdk-25.0.5.1%2B2/OpenJDK25U-jdk_\${arch}_alpine-linux_hotspot_25.0.5.1_2.tar.gz" -o /tmp/jdk.tar.gz; echo "$hash  /tmp/jdk.tar.gz" | sha256sum -c -; mkdir -p /opt/rtc-java; tar -xzf /tmp/jdk.tar.gz -C /opt/rtc-java --strip-components=1; rm /tmp/jdk.tar.gz\nENV JAVA_HOME=/opt/rtc-java PATH=/opt/rtc-java/bin:$PATH\nFROM java AS build\nENV MAVEN_CONFIG="" MAVEN_USER_HOME=/opt/rtc-maven-home\nWORKDIR /work\nCOPY source/ ./\nCOPY maven-artifacts.sha256 fetch-maven-artifacts.sh ./\nRUN --mount=type=cache,id=rtc-tax-maven-locked-v5,target=/root/.m2,sharing=locked sh /work/fetch-maven-artifacts.sh && ./mvnw --version\nRUN --network=none mkdir -p calculadora/db && ./mvnw -o --strict-checksums -Dmaven.repo.local=/tmp/rtc-tax-maven-repository flyway:migrate -Dflyway.configFiles=./flyway/flyway-pro.conf --batch-mode && ./mvnw -o --strict-checksums -Dmaven.repo.local=/tmp/rtc-tax-maven-repository -Dmaven.compiler.proc=full -DskipTests package --batch-mode\nFROM java\nLABEL org.rtc-tax.recipe="v0.1.0-7"\nWORKDIR /work\nCOPY --from=build /work/target/${p.jar} /work/app.jar\nCOPY --from=build /work/calculadora/db/calculadora-pro.db /work/calculadora/db/calculadora-pro.db\nEXPOSE ${p.port} ${p.health}\nENTRYPOINT ["java","-Dspring.profiles.active=offline","-jar","/work/app.jar"]\n`;
    await writeFile(join(temp, 'Dockerfile'), recipe);
    await docker.build(tag, temp);
    return tag;
  } finally { await rm(temp, { recursive: true, force: true }); }
}
interface Shared { refs: number; ready: Promise<CoordinatedEngine> }
const shared = new Map<Engine, Shared>();
const stopping = new Map<Engine, Promise<void>>();
async function launch(engine: Engine, timeoutMs: number): Promise<CoordinatedEngine> {
  const p = projects[engine], docker = new DockerAdapter();
  return coordinatedEngine(engine, docker, { port: p.port, health: p.health, env: p.env, startupTimeoutMs: timeoutMs }, () => buildImage(engine, docker));
}
export interface Lease { base: string; release(): Promise<void> }
/** Shares an engine across SDK instances in the same Node process. */
export async function acquire(engine: Engine, timeoutMs: number): Promise<Lease> {
  while (stopping.has(engine)) await stopping.get(engine);
  let item = shared.get(engine);
  if (!item) {
    const entry: Shared = { refs: 0, ready: launch(engine, timeoutMs) };
    shared.set(engine, entry);
    void entry.ready.catch(() => { if (shared.get(engine) === entry) shared.delete(engine); });
    item = entry;
  }
  item.refs++;
  let instance: CoordinatedEngine;
  try { instance = await item.ready; } catch (error) { item.refs--; throw error; }
  let released = false;
  return { base: instance.base, async release() {
    if (released) return; released = true;
    item!.refs--;
    if (item!.refs === 0) {
      shared.delete(engine);
      const operation = instance.release();
      stopping.set(engine, operation);
      try { await operation; } finally { if (stopping.get(engine) === operation) stopping.delete(engine); }
    }
  } };
}
