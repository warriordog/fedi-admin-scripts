export interface Block {
    host: string;
    sources: string[];

    publicReason?: string;
    privateReason?: string;
    redact?: boolean;

    severity: FederationLimit;
    setNSFW?: boolean;

    rejectMedia?: boolean;
    rejectAvatars?: boolean;
    rejectBanners?: boolean;
    rejectBackgrounds?: boolean;
    rejectReports?: boolean;
}

export type FederationLimit = 'suspend' | 'silence' | 'unlist' | 'ghost' | 'filter' | 'none';
