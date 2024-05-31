import {readFile} from "node:fs/promises";

export interface CSVConfig {
    /**
     * If true, then the first line will be treated as a header instead of content.
     */
    header?: boolean;

    /**
     * If true, then the header values will be used as columns.
     * Each returned row will include dynamic properties mapping those columns to the correct index.
     */
    columns?: boolean;
}

export async function parseCSVFile<T extends string[]>(path: string, config?: CSVConfig): Promise<T[]> {
    const text = await readFile(path, 'utf-8');
    return parseCSVText<T>(text, config);
}

export function parseCSVText<T extends string[]>(text: string, config?: CSVConfig): T[] {
    const hasHeader = config?.header ?? false;
    const mapColumns = config?.columns ?? false;
    if (mapColumns && !hasHeader) {
        throw new Error('Parsing error: bad CSV settings; hasHeader must be true if mapColumns is true');
    }

    const rows: string[][] = [];

    // Return all fields in a single, flat array.
    // This will contain some bad values like blank lines, but they will be filtered by popCSVLine.
    const fields = Array.from(text.matchAll(/(?<=(^)|,)(?:[^,\r\n"]*|"(?:""|[^"])*")(?=,|($))/gm))

    // First row is used for length validation, and *may* also become the header.
    const firstRow = popCSVLine(fields, null);
    if (firstRow == null) {
        throw new Error('Parsing error: input file is empty');
    }

    if (hasHeader) {
        for (const column of firstRow) {
            // Validation - make sure that the columns actually *can* be mapped safely.
            if (!/^[a-z_$][a-z0-9_$]*$/i.test(column)) {
                throw new Error(`Parsing error: column "${column}" has an invalid name (cannot be used as a JavaScript property)`);
            }

            // Security - prevent a variant of over-assignment where a column could shadow "length" or some other array property.
            if (Reflect.has(firstRow, column)) {
                throw new Error(`Parsing error: column "${column}" conflicts with an existing array property`);
            }
        }
    } else {
        // If it's not a header, then make sure to put it back in the dataset!
        rows.push(firstRow);
    }

    // Read the rest of the rows, with proper length validation this time.
    const numExpectedCells = firstRow.length;
    while (true) {
        const row = popCSVLine(fields, numExpectedCells);
        if (row == null) {
            break;
        }

        // Create column aliases
        if (hasHeader) {
            for (let i = 0; i < numExpectedCells; i++) {
                Object.defineProperty(row, firstRow[i], {
                    get: () => row[i],
                    set: (value) => row[i] = value
                });
            }
        }

        rows.push(row);
    }

    return rows as T[];
}

function popCSVLine(fields: string[][], numExpectedCells: number | null): string[] | null {
    // Magic: skip empty lines.
    // The regex indicates empty lines with as a unique sentinel value: all matches equal to an empty string.
    // Match[0] is the field value.
    // Match[1] is the SOL anchor.
    // Match[2] is the EOL anchor.
    while (fields.length > 0 && fields[0][0] === '' && fields[0][1] === '' && fields[0][2] === '') {
        fields.shift();
    }

    // Stop if we reach the end-of-file.
    // We have to do it in this function because the parent can't account for empty lines.
    if (fields.length === 0) {
        return null;
    }

    const row: string[] = [];

    for (let match = fields.shift(); !!match; match = fields.shift()) {
        const cell = parseCell(match[0]);
        row.push(cell);

        // EOL will be an empty string if this is the last field in the row.
        if (match[2] === '') {
            break;
        }
    }

    if (numExpectedCells != null && row.length !== numExpectedCells) {
        throw new Error(`Parsing error: found ${row.length} fields, but expected ${numExpectedCells}. Cells: ${JSON.stringify(row)}`);
    }

    return row;
}

function parseCell(cell: string): string {
    // Unquote strings
    if (cell.startsWith('"')) {
        if (cell.length < 2 || !cell.endsWith("")) {
            throw new Error(`Parsing error: field contains extraneous quotes: '${cell}'`);
        }

        cell = cell
            .substring(1, cell.length - 1)
            .replaceAll('""', '"');
    }

    return cell;
}
