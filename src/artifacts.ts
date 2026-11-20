import { createHash } from 'node:crypto';
import { RTCEngineError } from './errors.js';

/** Hash of the Maven artifact lock shipped with this SDK recipe. */
const LOCK_SHA256 = '54999117c34a8d073b11dec5b2a1f2cbfc3d84c157f4ae18af544e84b95e24c1';
export function verifyMavenLock(lock: Uint8Array): void {
  if (createHash('sha256').update(lock).digest('hex') !== LOCK_SHA256) {
    throw new RTCEngineError('Maven artifact lock integrity check failed');
  }
}
