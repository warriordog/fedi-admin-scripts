import {PleromaConfig} from "../../api/pleroma/PleromaConfig.js";
import {PleromaRemote} from "../standard/PleromaRemote.js";
import {PleromaInstance} from "../../api/pleroma/pleromaInstance.js";

export class PleromaFastRemote extends PleromaRemote {
    protected pleromaInstance?: PleromaInstance;
    protected pleromaConfig?: PleromaConfig;
    private pendingPleromaConfig?: PleromaConfig;

    async initialize(): Promise<void> {
        this.pleromaConfig = await super.getConfig();
        this.pleromaInstance = await super.getInstance();
    }

    async commit(): Promise<void> {
        if (this.pendingPleromaConfig) {
            await super.updateConfig(this.pendingPleromaConfig);
        }
    }

    async getConfig(): Promise<PleromaConfig> {
        return this.pleromaConfig ??= await super.getConfig();
    }

    async updateConfig(config: PleromaConfig): Promise<void> {
        if (this.pleromaConfig) {
            Object.assign(this.pleromaConfig, config);
        }

        if (this.pendingPleromaConfig) {
            Object.assign(this.pendingPleromaConfig, config);
        } else {
            this.pendingPleromaConfig = config;
        }
    }


    async getInstance(): Promise<PleromaInstance> {
        return this.pleromaInstance ??= await super.getInstance();
    }
}
