declare module 'pg' {
  export class Pool {
    constructor(options: { connectionString: string });
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
    connect(): Promise<PoolClient>;
  }

  export interface PoolClient {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
    release(): void;
  }
}
