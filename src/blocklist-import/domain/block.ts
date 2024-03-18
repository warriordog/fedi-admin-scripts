export interface Block {
    host: string;
    reason: string;
    redact: boolean;

    suspend: boolean;
    silence: boolean;
    unlist: boolean;
    disconnect: boolean;

    rejectMedia: boolean;
    rejectAvatars: boolean;
    rejectBanners: boolean;
    rejectBackgrounds: boolean;
    rejectReports: boolean;

    setNSFW: boolean;
}
