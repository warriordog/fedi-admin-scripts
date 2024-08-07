/**
 * Explodes a domain name into a list of base domains.
 * The returned stream includes the original domain, and is ordered by decreasing specificity.
 */
export function *explodeDomain(domain: string): Iterable<string> {
    yield domain;

    while (domain.includes('.')) {
        domain = domain.substring(domain.indexOf('.') + 1);
        if (domain) {
            yield domain;
        }
    }
}

/**
 * Get a sortable "key" for a domain.
 * The returned key is the reversed fully-qualified domain.
 */
export function getDomainKey(domain: string): string {
    // Flip the domain into "key" for semantic ordering.
    // Not very efficient, but it works.
    return domain
        .split('.')
        .reverse()
        .join('.');
}