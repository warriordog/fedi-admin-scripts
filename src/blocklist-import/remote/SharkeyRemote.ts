import {Remote} from "./remote.js";
import {Config} from "../domain/config.js";
import {SharkeyClient} from "../../common/api/sharkey/SharkeyClient.js";
import {Block} from "../domain/block.js";
import {BlockResult} from "../domain/blockResult.js";
import {SharkeyInstance} from "../../common/api/sharkey/sharkeyInstance.js";
import {SharkeyMeta} from "../../common/api/sharkey/sharkeyMeta.js";
import {toYMD} from "../../common/util/dateUtils.js";

export class SharkeyRemote implements Remote {
    private readonly client: SharkeyClient;

    constructor(
        private readonly config: Config,
        public readonly host: string,
        token: string
    ) {
        this.client = new SharkeyClient(host, token);
    }

    async tryApplyBlock(block: Block): Promise<BlockResult> {
        // Get current block status
        const instance = await this.client.getInstance(block.host);
        const meta = await this.client.getMeta();

        // Check for changes
        if (isUpToDate(instance, meta, block)) {
            return 'skipped';
        }

        // This is all very fucked:
        // 1. some blocks are considered part of local instance metadata, while others are remote.
        // 2. update-instance and update-meta can only handle one property at a time. You can pass multiple, but only one will save.
        // 3. if the remote instance is unknown and offline, then "instance" will be null. we still have to address local instance metadata.

        // silence and suspend (block) must be set through meta.
        const doSuspend = block.suspend && !meta.blockedHosts.includes(block.host);
        const doSilence = block.silence && !meta.silencedHosts.includes(block.host);

        // setNSFW (isNSFW) and stop delivery (suspend) must be set through instance.
        const doNSFW = block.setNSFW && !!instance && !instance.isNSFW;
        const doStop = block.disconnect && !!instance && !instance.isSuspended;

        // reason (moderationNote) must be set through instance, but
        const doModNote = !!instance;

        // We want to save a mod note, but it needs to specify whether this is a net-new or updated block.
        // That ends up being a rather ugly block of logic:
        const isNewBlock =
            (block.suspend === doSuspend) &&
            (block.silence === doSilence) &&
            (block.setNSFW === doNSFW || !instance) &&
            (block.disconnect === doStop|| !instance);

        // Apply everything
        if (!this.config.dryRun) {
            if (doSuspend) {
                await this.client.updateMeta({
                    blockedHosts: meta.blockedHosts.concat(block.host)
                });
            }

            if (doSilence) {
                await this.client.updateMeta({
                    silencedHosts: meta.silencedHosts.concat(block.host)
                });
            }

            if (doNSFW) {
                await this.client.updateInstance({
                    host: block.host,
                    isNSFW: instance.isNSFW || block.setNSFW
                });
            }

            if (doStop) {
                await this.client.updateInstance({
                    host: block.host,
                    isSuspended: instance.isSuspended || block.disconnect
                });
            }

            if (doModNote) {
                const today = toYMD(new Date());
                const blockType = isNewBlock ? 'created' : 'updated';
                const blockReason = block.reason || 'unspecified'
                const newModNote = `${today}: list import; ${blockType} block for [${blockReason}].`

                // Preserve any existing note.
                // Sharkey uses newlines (\n) directly, which makes this easy.
                const finalModNote = instance.moderationNote
                    ? `${instance.moderationNote}\n${newModNote}`
                    : newModNote;

                await this.client.updateInstance({
                    host: block.host,
                    moderationNote: finalModNote
                });
            }
        }

        return isNewBlock
            ? 'created'
            : 'updated';
    }
}

function isUpToDate(instance: SharkeyInstance | null, meta: SharkeyMeta, block: Block): boolean {
    // If the instance was loaded, then we can just check the properties.
    if (instance) {
        if (block.disconnect && !instance.isSuspended) return false;
        if (block.suspend && !instance.isBlocked) return false;
        if (block.silence && !instance.isSilenced) return false;
        if (block.setNSFW && !instance.isNSFW) return false;

        // Otherwise, we need to check meta.
    } else {
        if (block.suspend && !meta.blockedHosts.includes(block.host)) return false;
        if (block.silence && !meta.silencedHosts.includes(block.host)) return false;
    }

    return true;
}
