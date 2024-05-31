import {SharkeyInstance} from "./sharkeyInstance.js";
import {SharkeyAdminMeta} from "./sharkeyAdminMeta.js";
import {SharkeyUserMeta} from "./sharkeyUserMeta.js";

export class SharkeyClient {
    constructor(
        public readonly host: string,
        private readonly token: string
    ) {}

    public async getInstance(host: string): Promise<SharkeyInstance | null> {
        const resp = await this.makeRequest('/api/federation/show-instance', { host });

        if (!resp.ok) {
            throw new Error(`Failed to query instance ${host}, got status ${resp.status} ${resp.statusText}`);
        }
        if (resp.status === 204) {
            return null;
        }

        return await resp.json() as SharkeyInstance;
    }

    public async updateInstance(instance: Partial<SharkeyInstance>): Promise<void> {
        const resp = await this.makeRequest('/api/federation/update-instance', instance);

        if (!resp.ok) {
            throw new Error(`Failed to update instance ${instance.host}, got status ${resp.status} ${resp.statusText}`);
        }
    }

    public async getAdminMeta(): Promise<SharkeyAdminMeta> {
        const resp = await this.makeRequest('/api/admin/meta');

        if (!resp.ok) {
            throw new Error(`Failed to query instance metadata, got status ${resp.status} ${resp.statusText}`);
        }

        return await resp.json() as SharkeyAdminMeta;
    }

    public async getUserMeta(): Promise<SharkeyUserMeta> {
        const resp = await this.makeRequest('/api/meta');

        if (!resp.ok) {
            throw new Error(`Failed to query instance metadata, got status ${resp.status} ${resp.statusText}`);
        }

        return await resp.json() as SharkeyUserMeta;
    }

    public async updateMeta(meta: Partial<SharkeyAdminMeta>): Promise<void> {
        const resp = await this.makeRequest('/api/admin/update-meta', meta);

        if (!resp.ok) {
            throw new Error(`Failed to update instance metadata, got status ${resp.status} ${resp.statusText}`);
        }
    }

    public async searchInstances(query: Partial<SearchInstancesQuery>): Promise<SharkeyInstance[]> {
        query.sort ??= '+pubSub';
        query.allowPartial ??= true;
        query.limit = 100;
        query.offset = 0;

        const pages: SharkeyInstance[][] = [];
        while (true) {
            const resp = await this.makeRequest('/api/federation/instances', query);
            if (!resp.ok) {
                throw new Error(`Failed to query instances search, got status ${resp.status} ${resp.statusText}`);
            }

            // Read the next page.
            // Sharkey doesn't tell us when we hit the end, so we only stop if we get no results.
            const page = await resp.json() as SharkeyInstance[];
            if (page.length === 0) {
                break;
            }

            // save and "slide over" to the next page
            pages.push(page);
            query.offset += query.limit;
        }

        return pages.flat();
    }

    private async makeRequest(endpoint: string, payload?: Record<string, unknown>): Promise<Response> {
        const body = payload
            ? Object.assign({}, payload, { i: this.token })
            : { i: this.token };

        return await fetch(`https://${this.host}${endpoint}`, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
    }
}

export interface SearchInstancesQuery {
    sort: string;
    limit: number;
    offset?: number;
    allowPartial?: boolean;

    host?: string | null;
    nsfw?: boolean;
    federating?: boolean;
    silenced?: boolean;
    blocked?: boolean;
    suspended?: boolean;
}
