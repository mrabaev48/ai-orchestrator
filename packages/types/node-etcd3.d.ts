declare module 'etcd3' {
  export class Etcd3 {
    constructor(options: { hosts: string });
    lease(ttlSeconds: number): {
      put: (key: string) => {
        value: (value: string, options?: { prevNoExist?: boolean }) => Promise<unknown>;
      };
      revoke: () => Promise<void>;
    };
  }
}
