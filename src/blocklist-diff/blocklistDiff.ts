import {basename, extname, resolve} from 'path';
import {parseCSVFile, writeCSVFile} from '../common/util/csv.js';
import {explodeDomain, getDomainKey} from "../common/util/domainUtils.js";
import {Block} from "../common/domain/block.js";
import {parseMastodonBlock} from "../blocklist-import/source/mastodonSource.js";

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
        const flags = sources.map(s => getBlockSeverity(s.lines, domain));

        const key = getDomainKey(domain);
        const rating = getBlockRating(flags);

        const diff: Diff = [key, domain, rating, ...flags];
        return diff;
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

/**
 * Reads a CSV blocklist into a keyed dictionary of Domain => Block.
 */
async function readBlocklist(path: string): Promise<Map<string, Block>> {
    const lines = await parseCSVFile<Row>(path, { header: true, columns: true });

    return lines.reduce((map, line, i) => {
        const block = parseMastodonBlock(line);
        const domain = block.host;

        if (map.has(domain)) {
            console.warn(`Skipping line ${i} in ${path}: domain ${domain} is duplicated in the list`);
            return map;
        }

        return map.set(domain, block);
    }, new Map<string, Block>());
}

/**
 * Finds a blocked domain by aliases (base domain list) and returns the severity.
 * Defaults to "none" if the block is not in the list.
 */
function getBlockSeverity(list: Map<string, Block>, domain: string): string {
    const aliases = explodeDomain(domain);
    for (const alias of aliases) {
        const block = list.get(alias);
        if (block) {
            return block.severity;
        }
    }

    return 'none';
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
