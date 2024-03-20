import {Remote, RemoteSoftware} from "../Remote.js";
import {SharkeyClient} from "../../../common/api/sharkey/SharkeyClient.js";
import {Config} from "../../../../config/importBlocklist.js";
import {Block} from "../../domain/block.js";
import {BlockResult} from "../../domain/blockResult.js";
import {toYMD} from "../../../common/util/dateUtils.js";
import {Post} from "../../domain/post.js";
import {SharkeyInstance} from "../../../common/api/sharkey/sharkeyInstance.js";
import {SharkeyAdminMeta} from "../../../common/api/sharkey/sharkeyAdminMeta.js";

export class SharkeyRemote extends Remote {
    private readonly client: SharkeyClient

    constructor(
        private readonly config: Config,
        public readonly host: string,
        token: string
    ) {
        super();
        this.client = new SharkeyClient(host, token);
        this.stats.lostFollows = 0;
        this.stats.lostFollowers = 0;
    }

    async applyBlock(block: Block): Promise<BlockResult> {
        // Sharkey can't unlist without a full suspension
        if (block.limitFederation === 'unlist') {
            return 'unsupported';
        }

        // map the federation limit into individuals flags
        const isSuspend = block.limitFederation === 'suspend';
        const isSilence = block.limitFederation === 'suspend' || block.limitFederation === 'silence';
        const isDisconnect = block.limitFederation === 'suspend' || block.limitFederation === 'ghost';

        // Get current block status
        const instance = await this.client.getInstance(block.host);
        const meta = await this.getMeta();

        // Check for changes
        if (isUpToDate(instance, meta, block, isSuspend, isSilence, isDisconnect)) {
            return 'skipped';
        }

        // This is all very fucked:
        // 1. some blocks are considered part of local instance metadata, while others are remote.
        // 2. update-instance can only handle one property at a time. You can pass multiple, but only one will save.
        // 3. if the remote instance is unknown and offline, then "instance" will be null. we still have to address local instance metadata.

        // silence and suspend (block) must be set through meta.
        const doSuspend = isSuspend && !meta.blockedHosts.includes(block.host);
        const doSilence = isSilence && !meta.silencedHosts.includes(block.host);

        // setNSFW (isNSFW) and stop delivery (suspend) must be set through instance.
        const doNSFW = block.setNSFW && !!instance && !instance.isNSFW;
        const doDisconnect = isDisconnect && !!instance && !instance.isSuspended;

        // reason (moderationNote) must be set through instance, but
        const doModNote = !!instance;

        // We want to save a mod note, but it needs to specify whether this is a net-new or updated block.
        // That ends up being a rather ugly block of logic:
        const isNewBlock =
            (isSuspend === doSuspend) &&
            (isSilence === doSilence) &&
            (block.setNSFW === doNSFW || !instance) &&
            (isDisconnect === doDisconnect|| !instance);

        // Apply everything
        if (!this.config.dryRun) {
            if (doSuspend) {
                await this.updateMeta({
                    blockedHosts: meta.blockedHosts.concat(block.host)
                });
            }

            if (doSilence) {
                await this.updateMeta({
                    silencedHosts: meta.silencedHosts.concat(block.host)
                });
            }

            if (doNSFW) {
                await this.client.updateInstance({
                    host: block.host,
                    isNSFW: instance.isNSFW || block.setNSFW
                });
            }

            if (doDisconnect) {
                await this.client.updateInstance({
                    host: block.host,
                    isSuspended: instance.isSuspended || isDisconnect
                });
            }

            if (doModNote) {
                const today = toYMD(new Date());
                const blockType = isNewBlock ? 'created' : 'updated';

                // There are 4 possible wordings, depending on which fields are populated
                const newModNote =
                    block.publicReason
                        ? block.privateReason
                            ? `${today}: list import from ${block.source}; ${blockType} block for [${block.publicReason}] with note [${block.privateReason}].`
                            : `${today}: list import from ${block.source}; ${blockType} block for [${block.publicReason}].`
                        :block.privateReason
                            ? `${today}: list import from ${block.source}; ${blockType} block with note [${block.privateReason}].`
                            : `${today}: list import from ${block.source}; ${blockType} block without details.`

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

        // Update relation stats, since they aren't handled by the base class
        if (instance) {
            if (doSuspend || doDisconnect) {
                // These are flipped on purpose - sharkey uses opposite terminology
                this.stats.lostFollowers = (this.stats.lostFollowers ?? 0) + instance.followingCount;
            }
            if (doSuspend) {
                this.stats.lostFollows = (this.stats.lostFollows ?? 0) + instance.followersCount;
            }
        }

        return isNewBlock ? 'created' : 'updated';
    }

    async getMaxPostLength(): Promise<number> {
        const meta = await this.client.getUserMeta();
        return meta.maxNoteTextLength;
    }

    async publishPost(post: Post): Promise<string> {
        return '(error: not implemented)';
    }

    async getSoftware(): Promise<RemoteSoftware> {
        const meta = await this.getMeta();
        return { name: 'Sharkey', version: meta.version };
    }

    async getMeta(): Promise<SharkeyAdminMeta> {
        return await this.client.getAdminMeta();
    }

    async updateMeta(meta: Partial<SharkeyAdminMeta>): Promise<void> {
        await this.client.updateMeta(meta);
    }
}

function isUpToDate(instance: SharkeyInstance | null, meta: SharkeyAdminMeta, block: Block, isSuspend: boolean, isSilence: boolean, isDisconnect: boolean): boolean {
    // If the instance was loaded, then we can just check the properties.
    if (instance) {
        if (isDisconnect && !instance.isSuspended) return false;
        if (isSuspend && !instance.isBlocked) return false;
        if (isSilence && !instance.isSilenced) return false;
        if (block.setNSFW && !instance.isNSFW) return false;

        // Otherwise, we need to check meta.
    } else {
        if (isSuspend && !meta.blockedHosts.includes(block.host)) return false;
        if (isSilence && !meta.silencedHosts.includes(block.host)) return false;
    }

    return true;
}
