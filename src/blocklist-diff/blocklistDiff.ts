import {basename} from 'path';
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
type Row = string[] & Record<string, string | undefined>;
const sources = await Promise.all(sourcePaths
    .map(async p => ({
        name: basename(p),
        lines: await parseCSVFile<Row>(p, { header: true, columns: true  })
    }))
);

// Diff blocklists
const domains = new Set(sources
    .flatMap(s => s.lines
        .map(l => (l['#domain'] || l.domain)?.toLowerCase() as string)
        .filter(l => l)
    )
);
const blocks = Array
    .from(domains)
    .sort()
    .reduce((map, domain) => {
        const flags = sources.map(s => getSourceProperty(s.lines, domain, '#severity', 'severity') || 'none');
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

function getSourceProperty(rows: Row[], domain: string, ...properties: string[]): string | undefined {
    const row = rows.find(r => domain === (r['#domain'] || r.domain)?.toLowerCase());

    if (row) {
        for (const prop of properties) {
            const value = row[prop];
            if (value) {
                return value;
            }
        }
    }

    return undefined;;
}