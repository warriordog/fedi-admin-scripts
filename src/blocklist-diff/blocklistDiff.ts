import {basename, extname, resolve} from 'path';
import {parseCSVFile, writeCSVFile} from '../common/util/csv.js';

// Read diff path
if (process.argv.length <= 2) {
    console.warn('Usage: npm run blocklist-diff -- <diff_file> <source_1> <source_2> [source_3] [...]');
    process.exit(1);
}
const diffPath = process.argv[2];

// Read source paths
const sourcePaths = Array.from(
    new Set(
        process.argv
            .slice(3)
            .map(p => resolve(p))
    )
);
if (sourcePaths.length < 2) {
    console.warn(`Please specify at least two sources.`);
    process.exit(1);
}

// Read source blocklists
const sources = await Promise.all(sourcePaths
    .map(async p => ({
        name: basename(p, extname(p)),
        lines: await readBlocklist(p)
    }))
);

// Diff blocklists
const domains = Array.from(
    new Set(
        sources.flatMap(s =>
            Array.from(s.lines.keys())
        )
    )
);
const blocks = domains
    .map(domain => {
        const aliases = explodeDomain(domain);
        const flags = sources.map(s => getBlockSeverity(s.lines, aliases));

        const key = getDomainKey(domain);
        const rating = getBlockRating(flags);

        return [key, domain, rating, ...flags] satisfies Diff;
    })
    .sort((a, b) => a[0].localeCompare(b[0]));

// Write result file
const results = [
    // Header: key + domain + each source name
    ['key', 'domain', 'rating', ...sources.map(s => s.name)],

    // Body
    ...blocks
];
await writeCSVFile(diffPath, results);

/** Row of a CSV diff: key + domain + N flags (1 for each source) */
type Diff = [ key: string, domain: string, rating: string, ...flags: string[] ];

/** Row of a CSV blocklist */
type Row = string[] & Record<string, string | undefined>;

/** Block entry from a list */
type Block = { domain: string, severity: string };

/**
 * Reads a CSV blocklist into a keyed dictionary of Domain => Block.
 */
async function readBlocklist(path: string): Promise<Map<string, Block>> {
    const lines = await parseCSVFile<Row>(path, { header: true, columns: true });

    return lines.reduce((map, line, i) => {
        const domain = (line['#domain'] || line.domain)?.toLowerCase();
        if (!domain) {
            console.warn(`Skipping line ${i} in ${path}: no "domain" or "#domain" column found`);
            return map;
        }

        if (map.has(domain)) {
            console.warn(`Skipping line ${i} in ${path}: domain ${domain} is duplicated in the list`);
            return map;
        }

        const severity = parseBlockAction(line);
        const block = { domain, severity } satisfies Block;

        return map.set(domain, block);
    }, new Map<string, Block>());
}

function parseBlockAction(row: Row): string {
    // Most block actions are directly listed in the severity.
    // Some blocklists leave off the severity field, in which case suspension is implied.
    const severity = (row['#severity'] || row.severity)?.toLowerCase() || 'suspend';
    if (severity !== 'none')
        return severity;

    // Other actions set severity to "none" and details in other columns
    const otherAction =
        row['#set_nsfw'] || row.set_nsfw ||
        row['#reject_media'] || row.reject_media ||
        row['#reject_reports'] || row.reject_reports ||
        row['#reject_avatars'] || row.reject_avatars ||
        row['#reject_banners'] || row.reject_banners ||
        row['#reject_backgrounds'] || row.reject_backgrounds;
    if (otherAction)
        return 'filter';

    // If we don't find *anything*, then there's actually no action.
    // (shouldn't happen, but you never know)
    return 'none';
}

/**
 * Explodes a domain name into a list of base domains.
 * The returned list includes the original domain, and is ordered by decreasing specificity.
 */
function explodeDomain(domain: string): string[] {
    const aliases = [ domain ];
    while (domain.includes('.')) {
        domain = domain.substring(domain.indexOf('.') + 1);
        if (domain) {
            aliases.push(domain);
        }
    }
    return aliases;
}

/**
 * Finds a blocked domain by aliases (base domain list) and returns the severity.
 * Defaults to "none" if the block is not in the list.
 */
function getBlockSeverity(list: Map<string, Block>, domainAliases: string[]): string {
    for (const domain of domainAliases) {
        const block = list.get(domain);
        if (block) {
            return block.severity;
        }
    }

    return 'none';
}

/**
 * Get a sortable "key" for the domain.
 * The returned key is the reversed fully-qualified domain.
 */
function getDomainKey(domain: string): string {
    // Flip the domain into "key" for semantic ordering.
    // Not very efficient, but it works.
    return domain
        .split('.')
        .reverse()
        .join('.');
}

/**
 * Returns the "rating" of the domain formatted for human readability.
 * The rating is the percentage of sources that block the domain.
 */
function getBlockRating(flags: string[]): string {
    if (flags.length < 1)
        return "0%";

    const blockCount = flags.reduce((sum, severity) => {
        if (severity !== 'none')
            sum++;

        return sum;
    }, 0);

    const ratio = blockCount / flags.length;
    const percent = ratio * 100;
    return percent.toFixed() + '%';
}
