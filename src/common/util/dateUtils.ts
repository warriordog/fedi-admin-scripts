/**
 * Stringifies a date into YYYY-MM-DD format.
 */
export function toYMD(date: Date): string {
    const year = date.getUTCFullYear();

    const monthNumber = date.getUTCMonth() + 1;
    const month = monthNumber
        .toString()
        .padStart(2, '0');

    const day = date.getUTCDate()
        .toString()
        .padStart(2, '0');

    return `${year}-${month}-${day}`;
}
