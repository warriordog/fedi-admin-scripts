import {Block, FederationLimit} from "../../common/domain/block.js";
import {parseCSVFile} from "../../common/util/csv.js";
import {basename} from 'path';

export async function readMastodonSource(path: string): Promise<Block[]> {
    const rows = await parseCSVFile<MastodonCSVRow>(path, { header: true, columns: true });
    return rows.map(r => parseMastodonBlock(r, [ basename(path) ]));
}

export function parseMastodonBlock(row: MastodonCSVRow, sources: string[] = []): Block {
    const host = (row['#domain'] || row.domain)?.toLowerCase();
    if (!host) {
        throw new Error(`Invalid row: no domain column found`);
    }

    return {
        host,
        sources,

        publicReason: (row['public_comment'] || row.public_comment)?.replaceAll(/\r?\n/g, ' ') ?? '',
        privateReason: (row['private_comment'] || row.private_comment)?.replaceAll(/\r?\n/g, ' ') ?? '',
        redact: readBool(row['obfuscate'] || row.obfuscate),

        setNSFW: readBool(row['set_nsfw'] || row.set_nsfw),
        severity: readFederationLimit(row),

        rejectMedia: readBool(row['reject_media'] || row.reject_media),
        rejectAvatars: readBool(row['reject_avatars'] || row.reject_avatars),
        rejectBanners: readBool(row['reject_banners'] || row.reject_banners),
        rejectBackgrounds: readBool(row['reject_backgrounds'] || row.reject_backgrounds),
        rejectReports: readBool(row['reject_reports'] || row.reject_reports),
    };
}

function readFederationLimit(row: MastodonCSVRow): FederationLimit {
    const severity = (row['#severity'] || row.severity)?.toLowerCase() || 'suspend';
    switch (severity) {
        // Most block actions are directly listed in the severity.
        case 'suspend':
        case 'silence':
        case 'unlist':
        case 'ghost':
        case 'filter':
            return severity;

        // Some blocklists leave off the severity field, in which case suspension is implied.
        case undefined:
            return 'suspend';

        // Other actions set severity to "none" and details in other columns
        case 'none': {
            const otherAction =
                row['#set_nsfw'] || row.set_nsfw ||
                row['#reject_media'] || row.reject_media ||
                row['#reject_reports'] || row.reject_reports ||
                row['#reject_avatars'] || row.reject_avatars ||
                row['#reject_banners'] || row.reject_banners ||
                row['#reject_backgrounds'] || row.reject_backgrounds;

            return otherAction
                ? 'filter'
                : 'none';
        }

        // If we don't find *anything*, then there's actually no action.
        // (shouldn't happen, but you never know)
        default:
            return 'none';
    }
}

function readBool(raw: string | undefined) : boolean | undefined {
    if (raw === undefined) return undefined;
    return raw.toLowerCase() === 'true';
}

export type MastodonCSVRow = string[] & Record<string, string | undefined>;
