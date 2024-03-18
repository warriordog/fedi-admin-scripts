export interface AkkomaConfig {
    configs: AkkomaConfigSection<unknown>[];
    needs_reboot?: boolean;
}

export interface AkkomaConfigSection<T> {
    group: string;
    key: string;
    value: T;
    db?: string[];
}

export interface AkkomaTuple<T> {
    tuple: [string, T];
}
