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
