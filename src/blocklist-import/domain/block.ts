export interface Block {
    host: string;
    source: string;

    publicReason?: string;
    privateReason?: string;
    redact?: boolean;

    limitFederation?: FederationLimit;
    setNSFW?: boolean;

    rejectMedia?: boolean;
    rejectAvatars?: boolean;
    rejectBanners?: boolean;
    rejectBackgrounds?: boolean;
    rejectReports?: boolean;
}

export type FederationLimit = 'suspend' | 'silence' | 'unlist' | 'ghost';
