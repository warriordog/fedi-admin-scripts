import {Block, FederationLimit} from "../../common/domain/block.js";
import {parseCSVFile} from "../../common/util/csv.js";
import {basename} from 'path';

export async function readMastodonSource(path: string): Promise<Block[]> {
    const rows = await parseCSVFile<MastodonCSVRow>(path, { header: true, columns: true });
    return rows.map(r => ({
        host: r.domain,
        sources: [ basename(path) ],

        publicReason: r.public_comment?.replaceAll(/\r?\n/g, ' ') ?? '',
        privateReason: r.private_comment?.replaceAll(/\r?\n/g, ' ') ?? '',
        redact: readBool(r.obfuscate),

        setNSFW: readBool(r.set_nsfw),
        limitFederation: readFederationLimit(r.severity),

        rejectMedia: readBool(r.reject_media),
        rejectAvatars: readBool(r.reject_avatars),
        rejectBanners: readBool(r.reject_banners),
        rejectBackgrounds: readBool(r.reject_backgrounds),
        rejectReports: readBool(r.reject_reports),
    }));
}

function readFederationLimit(raw: string | undefined): FederationLimit | undefined {
    raw = raw?.toLowerCase();

    switch (raw) {
        case 'suspend':
        case 'silence':
        case 'unlist':
        case 'ghost':
            return raw;
        default:
            return undefined;
    }
}

function readBool(raw: string | undefined) : boolean | undefined {
    if (raw === undefined) return undefined;
    return raw.toLowerCase() === 'true';
}

export interface MastodonCSVRow extends Array<string> {
    domain: string;
    severity?: 'suspend' | 'silence' | 'none' | 'unlist' | 'ghost';
    public_comment?: string;
    reject_media?: MastodonBoolean;
    reject_avatars?: MastodonBoolean;
    obfuscate?: MastodonBoolean;
    set_nsfw?: MastodonBoolean;
    reject_banners?: MastodonBoolean;
    reject_backgrounds?: MastodonBoolean;
    reject_reports?: MastodonBoolean;
    private_comment?: string;
}

export type MastodonBoolean = 'True' | 'False';
