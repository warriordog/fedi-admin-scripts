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
type Row = string[] & Record<string, string | undefined>;
const sources = await Promise.all(sourcePaths
    .map(async p => ({
        name: basename(p, extname(p)),
        lines: await readCSVFile(p)
    }))
);

// Diff blocklists
const domains = new Set(
    sources.flatMap(s =>
        Array.from(s.lines.keys())
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

async function readCSVFile(path: string): Promise<Map<string, Row>> {
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

        return map.set(domain, line);
    }, new Map<string, Row>());
}

function getSourceProperty(rows: Map<string, Row>, domain: string, ...properties: string[]): string | undefined {
    const row = rows.get(domain);

    if (row) {
        for (const prop of properties) {
            const value = row[prop];
            if (value) {
                return value;
            }
        }
    }

    return undefined;
}