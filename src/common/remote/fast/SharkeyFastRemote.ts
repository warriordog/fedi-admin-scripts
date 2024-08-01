import {SharkeyRemote} from "../standard/SharkeyRemote.js";
import {SharkeyAdminMeta} from "../../api/sharkey/sharkeyAdminMeta.js";

export class SharkeyFastRemote extends SharkeyRemote {
    protected sharkeyMeta?: SharkeyAdminMeta;
    private pendingSharkeyMeta?: Partial<SharkeyAdminMeta>;

    async initialize(): Promise<void> {
        this.sharkeyMeta = await super.getMeta();
    }

    async commit(): Promise<void> {
        if (this.pendingSharkeyMeta) {
            await super.updateMeta(this.pendingSharkeyMeta);
        }
    }

    async getMeta(): Promise<SharkeyAdminMeta> {
        return this.sharkeyMeta ??= await super.getMeta();
    }

    async updateMeta(meta: Partial<SharkeyAdminMeta>): Promise<void> {
        if (this.sharkeyMeta) {
            Object.assign(this.sharkeyMeta, meta);
        }

        if (this.pendingSharkeyMeta) {
            Object.assign(this.pendingSharkeyMeta, meta);
        } else {
            this.pendingSharkeyMeta = meta;
        }
    }
}
