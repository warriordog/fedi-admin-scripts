import {PartialBlockResult, Remote, RemoteSoftware} from "../Remote.js";
import {SharkeyClient} from "../../api/sharkey/SharkeyClient.js";
import {Block} from "../../domain/block.js";
import {toYMD} from "../../util/dateUtils.js";
import {Post} from "../../domain/post.js";
import {isSuspended, SharkeyInstance} from "../../api/sharkey/sharkeyInstance.js";
import {SharkeyAdminMeta} from "../../api/sharkey/sharkeyAdminMeta.js";
import {RemoteSettings} from "../remoteSettings.js";

export class SharkeyRemote extends Remote {
    readonly tracksFollowers = true;
    readonly tracksFollows = true;
    readonly seversFollowers = false;
    readonly seversFollows = false;

    private readonly client: SharkeyClient

    constructor(
        private readonly settings: RemoteSettings,
        public readonly host: string,
        token: string
    ) {
        super();
        this.client = new SharkeyClient(host, token);
    }

    async applyBlock(block: Block): Promise<PartialBlockResult> {
        // Sharkey can't unlist without a full suspension
        if (block.severity === 'unlist') {
            return 'excluded';
        }

        // map the federation limit into individuals flags
        const isSuspend = block.severity === 'suspend';
        const isSilence = block.severity === 'suspend' || block.severity === 'silence';
        const isGhost = block.severity === 'suspend' || block.severity === 'ghost';

        // Get current block status
        const instance = await this.client.getInstance(block.host);
        const meta = await this.getMeta();

        // Check for changes
        if (isUpToDate(instance, meta, block, isSuspend, isSilence, isGhost)) {
            return 'unchanged';
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
        const doGhost = isGhost && !!instance && !instance.isSuspended;

        // reason (moderationNote) must be set through instance, but
        const doModNote = !!instance;

        // We want to save a mod note, but it needs to specify whether this is a net-new or updated block.
        // That ends up being a rather ugly block of logic:
        const isNewBlock =
            (isSuspend === doSuspend) &&
            (isSilence === doSilence) &&
            (block.setNSFW === doNSFW || !instance) &&
            (isGhost === doGhost|| !instance);

        // Check for existing follow relations
        // "followingCount" and "followersCount" are intentionally flipped because sharkey uses opposite terminology.
        const lostFollowers = instance && (doSuspend || doGhost)
            ? instance.followingCount : 0;
        const lostFollows = instance && (doSuspend)
            ? instance.followersCount : 0;

        if (this.settings.preserveConnections && (lostFollowers > 0 || lostFollows > 0)) {
            return 'excluded';
        }

        // Apply everything
        if (!this.settings.dryRun) {
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

            if (doGhost) {
                await this.client.updateInstance({
                    host: block.host,
                    isSuspended: instance.isSuspended || isGhost
                });
            }

            if (doModNote) {
                const today = toYMD(new Date());
                const source = block.sources.join(' & ');
                const blockType = isNewBlock ? 'created' : 'updated';

                // There are 4 possible wordings, depending on which fields are populated
                const newModNote =
                    block.publicReason
                        ? block.privateReason
                            ? `${today}: list import from ${source}; ${blockType} block for [${block.publicReason}] with note [${block.privateReason}].`
                            : `${today}: list import from ${source}; ${blockType} block for [${block.publicReason}].`
                        :block.privateReason
                            ? `${today}: list import from ${source}; ${blockType} block with note [${block.privateReason}].`
                            : `${today}: list import from ${source}; ${blockType} block without details.`

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

        const action = isNewBlock ? 'created' : 'updated';
        return { action, lostFollows, lostFollowers };
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

    async getBlocklist(): Promise<Block[]> {
        // Lookup each list
        const { blockedHosts, silencedHosts } = await this.getMeta();
        const instances = mapUniqueInstances(
            await Promise.all([
                this.client.searchInstances({ suspended: true })
                    .then(instances => instances.filter(i => isSuspended(i))),
                this.client.searchInstances({ silenced: true }),
                this.client.searchInstances({ blocked: true }),
                this.client.searchInstances({ nsfw: true })
            ])
        );

        // Pivot from (type -> (host | instance)) to (host -> type)
        const allHosts = getAllHosts(instances, blockedHosts, silencedHosts);
        return allHosts.map((host): Block => {
            const instance = instances.get(host);

            // Unknown instance give us very little to go on
            if (!instance) {
                return {
                    host,
                    sources: [this.host],
                    severity:
                        blockedHosts.includes(host)
                            ? 'suspend'
                            : silencedHosts.includes(host)
                                ? 'silence'
                                : 'none'
                };
            }

            // But known instances have tons of metadata!
            return ({
                host,
                sources: [this.host],

                privateReason: instance.moderationNote ?? undefined,
                severity:
                    instance.isBlocked
                        ? 'suspend'
                        : instance.isSilenced
                            ? 'silence'
                            : instance.isSuspended
                                ? 'ghost'
                                : instance.isNSFW
                                    ? 'filter'
                                    : 'none',
                setNSFW: instance.isNSFW
            });
        });
    }

    protected async getMeta(): Promise<SharkeyAdminMeta> {
        return await this.client.getAdminMeta();
    }

    protected async updateMeta(meta: Partial<SharkeyAdminMeta>): Promise<void> {
        await this.client.updateMeta(meta);
    }
}

function isUpToDate(instance: SharkeyInstance | null, meta: SharkeyAdminMeta, block: Block, isSuspend: boolean, isSilence: boolean, isDisconnect: boolean): boolean {
    // If the instance was loaded, then we can just check the properties.
    if (instance) {
        if (isDisconnect && !isSuspended(instance)) return false;
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

function mapUniqueInstances(instances: SharkeyInstance[][]): Map<string, SharkeyInstance> {
    const unique = new Map<string, SharkeyInstance>();

    for (const instance of instances.flat()) {
        // We will probably overwrite many times here, but that's ok.
        // All the instance objects should be identical.
        unique.set(instance.host, instance);
    }

    return unique;
}

function getAllHosts(instances: Map<string, SharkeyInstance>, blockedHosts: string[], silencedHosts: string[]): string[] {
    const hosts =
        Array.from(instances.keys())
        .concat(blockedHosts, silencedHosts);

    return Array.from(new Set(hosts));
}
