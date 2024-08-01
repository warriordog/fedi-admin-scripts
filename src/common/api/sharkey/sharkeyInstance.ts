export interface SharkeyInstance {
    id: string;
    firstRetrievedAt: string;
    host: string;
    usersCount: number;
    notesCount: number;
    followingCount: number;
    followersCount: number;
    isNotResponding: number;
    isSuspended: boolean;
    suspensionState?: string;
    isBlocked: boolean;
    softwareName: string | null;
    softwareVersion: string | null;
    openRegistrations: boolean;
    name: string | null;
    description: string | null;
    maintainerName: string | null;
    maintainerEmail: string | null;
    isSilenced: boolean;
    iconUrl: string | null;
    faviconUrl: string | null;
    themeColor: string | null;
    infoUpdatedAt: string;
    latestRequestReceivedAt: string | null;
    isNSFW: boolean;
    moderationNote: string | null;
}

export function isSuspended(instance: SharkeyInstance): boolean {
    // Newer instances track automatic suspensions, but only ones don't have the property at al.
    if (instance.suspensionState && instance.suspensionState !== 'manuallySuspended')
        return false;

    return instance.isSuspended;
}