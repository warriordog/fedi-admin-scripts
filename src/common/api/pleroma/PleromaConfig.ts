export interface PleromaConfig {
    configs: PleromaConfigSection<unknown>[];
    needs_reboot?: boolean;
}

export interface PleromaConfigSection<T> {
    group: string;
    key: string;
    value: T;
    db?: string[];
}

export interface Tuple<T> {
    tuple: [string, T];
}
