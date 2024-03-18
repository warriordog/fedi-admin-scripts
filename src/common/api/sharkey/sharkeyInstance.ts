export interface SharkeyInstance {
    host: string;
    isSuspended: boolean;
    isBlocked: boolean;
    isSilenced: boolean;
    isNSFW: boolean;
    moderationNote: string;
}
