export class RTCError extends Error {
  constructor(message: string, public readonly code: string, options?: ErrorOptions) { super(message, options); this.name = new.target.name; }
}
export class RTCHttpError extends RTCError {
  constructor(public readonly status: number) { super(`Tax engine returned HTTP ${status}`, 'HTTP_ERROR'); }
}
export class RTCTimeoutError extends RTCError { constructor(message = 'Tax engine request timed out') { super(message, 'TIMEOUT'); } }
export class RTCConnectionError extends RTCError { constructor(message: string, options?: ErrorOptions) { super(message, 'CONNECTION_ERROR', options); } }
export class RTCEngineError extends RTCError { constructor(message: string, options?: ErrorOptions) { super(message, 'ENGINE_ERROR', options); } }
export class RTCClosedError extends RTCError { constructor() { super('RTC Tax instance is closed', 'CLOSED'); } }
