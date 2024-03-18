import {Block} from "../domain/block.js";
import {parseCSVFile} from "../../common/util/csv.js";

export async function readMastodonSource(path: string): Promise<Block[]> {
    const rows = await parseCSVFile<MastodonCSVRow>(path, { header: true, columns: true });
    return rows.map(r => {
        const severity = r.severity?.toLowerCase();
        return {
            host: r.domain,
            reason: r.public_comment?.replaceAll(/\r?\n/g, ' ') ?? '',
            suspend: severity === 'suspend',
            silence: severity === 'suspend' || severity === 'silence',
            unlist: severity === 'suspend' || severity === 'silence' || severity === 'unlist',
            disconnect: severity === 'suspend' || severity === 'disconnect',
            rejectMedia: r.reject_media?.toLowerCase() === 'true',
            rejectAvatars: r.reject_avatars?.toLowerCase() === 'true',
            rejectBanners: r.reject_banners?.toLowerCase() === 'true',
            rejectBackgrounds: r.reject_backgrounds?.toLowerCase() === 'true',
            rejectReports: r.reject_reports?.toLowerCase() === 'true',
            redact: r.obfuscate?.toLowerCase() === 'true',
            setNSFW: r.set_nsfw?.toLowerCase() === 'true'
        };
    });
}

export interface MastodonCSVRow extends Array<string> {
    domain: string;
    severity?: 'suspend' | 'silence' | 'none' | 'unlist' | 'disconnect';
    public_comment?: string;
    reject_media?: MastodonBoolean;
    reject_avatars?: MastodonBoolean;
    obfuscate?: MastodonBoolean;
    set_nsfw?: MastodonBoolean;
    reject_banners?: MastodonBoolean;
    reject_backgrounds?: MastodonBoolean;
    reject_reports?: MastodonBoolean;
}

export type MastodonBoolean = 'True' | 'False';
