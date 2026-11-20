import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { RTCEngineError } from './errors.js';
const run = promisify(execFile);
export interface DockerContainer {
  Id: string;
  Image: string;
  State: { Running: boolean };
  Config: { Labels: Record<string, string> | null };
}
/** The sole boundary for interaction with the Docker CLI/Engine. */
export class DockerAdapter {
  async command(args: string[], timeout = 120_000): Promise<string> {
    try { return (await run('docker', args, { timeout, maxBuffer: 4 * 1024 * 1024 })).stdout.trim(); }
    catch (error) { throw new RTCEngineError(`Docker operation failed: ${args[0] ?? 'unknown'}`, { cause: error }); }
  }
  async daemonId(): Promise<string> {
    const id = await this.command(['info', '--format', '{{.ID}}']);
    if (!id) throw new RTCEngineError('Docker Engine did not provide an ID');
    return id;
  }
  async imageExists(tag: string): Promise<boolean> {
    let label: string;
    try { label = await this.command(['image', 'inspect', tag, '--format', '{{index .Config.Labels "org.rtc-tax.recipe"}}']); }
    catch (error) {
      const stderr = (error as RTCEngineError).cause as { stderr?: string } | undefined;
      if (/No such (?:object|image)/i.test(stderr?.stderr ?? '')) return false;
      throw error;
    }
    if (label !== 'v0.1.0-7') throw new RTCEngineError(`Existing image ${tag} is not compatible; refusing to overwrite it`);
    return true;
  }
  async imageId(tag: string): Promise<string> { return this.command(['image', 'inspect', tag, '--format', '{{.Id}}']); }
  async container(ref: string): Promise<DockerContainer | undefined> {
    try { return JSON.parse(await this.command(['container', 'inspect', ref, '--format', '{{json .}}'])) as DockerContainer; }
    catch (error) {
      const cause = (error as RTCEngineError).cause as { stderr?: string } | undefined;
      if (/No such (?:object|container)/i.test(cause?.stderr ?? '')) return undefined;
      throw error;
    }
  }
  async build(tag: string, dir: string): Promise<void> { await this.command(['build', '-t', tag, dir], 20 * 60_000); }
  async start(tag: string, appPort: number, healthPort: number, versionEnv: string, name: string, labels: Record<string, string>): Promise<string> {
    const args = ['run', '-d', '--rm', '--name', name, '-p', `127.0.0.1::${appPort}`, '-p', `127.0.0.1::${healthPort}`, '-e', `${versionEnv}=http://127.0.0.1:1/`];
    for (const [key, value] of Object.entries(labels)) args.push('--label', `${key}=${value}`);
    return this.command([...args, tag]);
  }
  async port(id: string, port: number): Promise<string> {
    const mapped = await this.command(['port', id, `${port}/tcp`]);
    const match = /^127\.0\.0\.1:(\d+)$/.exec(mapped);
    if (!match) throw new RTCEngineError('Docker returned an unexpected port mapping');
    return `http://127.0.0.1:${match[1]}`;
  }
  async stop(id: string): Promise<void> { await this.command(['stop', '-t', '10', id], 30_000); }
}
