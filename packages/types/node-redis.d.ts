declare module 'redis' {
  export interface RedisClientType {
    connect: () => Promise<void>;
    set: (key: string, value: string, options?: { NX?: boolean; PX?: number }) => Promise<unknown>;
    eval: (script: string, options: { keys: string[]; arguments: string[] }) => Promise<unknown>;
  }

  export function createClient(options: { url: string }): RedisClientType;
}
