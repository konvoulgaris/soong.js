import { Environment } from '@soong/constants';
import { pino } from 'pino';

type LogFields = { key: Uppercase<string> } & Record<string, unknown>;

type LogMethod = (fields: LogFields) => void;

// An empty NODE_ENV counts as not set, like in the server config.
const isLocalhost = [undefined, '', Environment.Localhost].includes(process.env.NODE_ENV);

// The narrow type makes every log take one object with an UPPER_CASE key. Node strips the type, so pino runs unchanged.
export const logger: Record<'debug' | 'info' | 'warn' | 'error', LogMethod> = pino(
  isLocalhost ? { transport: { target: 'pino-pretty', options: { messageKey: 'key' } } } : {},
);
