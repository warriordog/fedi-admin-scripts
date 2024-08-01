import {basename, extname} from 'path';
import {parseCSVFile, writeCSVFile} from '../common/util/csv.js';

// Read parameters
if (process.argv.length < 5) {
    console.warn(`Please specify at least two sources.`);
    console.warn('Usage: npm run blocklist-diff -- <diff_file> <source_1> <source_2> [source_3] [...]');
    process.exit(1);
}
const diffPath = process.argv[2];
const sourcePaths = process.argv.slice(3);

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
    .sort()
    .reduce((map, domain) => {
        const aliases = explodeDomain(domain);
        const flags = sources.map(s => getBlockSeverity(s.lines, aliases));
        return map.set(domain, flags);
    }, new Map<string, string[]>);

// Write result file
const results: string[][] = [
    // Header: domain + each source name
    ['domain', ...sources.map(s => s.name)],

    // Body: rows of domain +  flag for each source
    ...Array
        .from(blocks)
        .map(r => r
            .flat())
];
await writeCSVFile(diffPath, results);

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

        const severity = (line['#severity'] || line.severity)?.toLowerCase() || 'none';

        return map.set(domain, {
            domain,
            severity
        });
    }, new Map<string, Block>());
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