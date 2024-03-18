import {AkkomaConfig} from "./AkkomaConfig.js";

export class AkkomaClient {
    constructor(
        public readonly host: string,
        private readonly token: string
    ) {}

   public async readConfig(): Promise<AkkomaConfig> {
       const resp = await this.makeGetRequest('/api/v1/pleroma/admin/config');

        if (!resp.ok) {
            throw new Error(`Failed to read instance config, got status ${resp.status} ${resp.statusText}`);
        }

        return await resp.json() as AkkomaConfig;
    }

    public async saveConfig(config: AkkomaConfig): Promise<void> {
        const resp = await this.makePostRequest('/api/v1/pleroma/admin/config', config);

        if (!resp.ok) {
            throw new Error(`Failed to save instance config, got status ${resp.status} ${resp.statusText}`);
        }
    }

    private async makePostRequest(endpoint: string, payload: unknown): Promise<Response> {
        return await fetch(`https://${this.host}${endpoint}`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json;charset=utf-8',
                Accept: 'application/json',
                Authorization: `Bearer ${this.token}`
            },
            body: JSON.stringify(payload)
        });
    }

    private async makeGetRequest(endpoint: string): Promise<Response> {
        return await fetch(`https://${this.host}${endpoint}`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${this.token}`
            }
        });
    }
}
