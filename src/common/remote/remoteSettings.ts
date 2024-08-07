export interface RemoteSettings {
    readonly fastMode: boolean;
    readonly dryRun: boolean;
    readonly preserveConnections: boolean;
}

export const defaultRemoteSettings: RemoteSettings = {
    // Fast mode off for safety.
    fastMode: false,

    // Use read-only mode for safety.
    dryRun: true,

    // Set non-destructive mode for safety.
    preserveConnections: true
};