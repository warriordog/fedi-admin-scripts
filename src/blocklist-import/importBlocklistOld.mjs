#!/usr/bin/env node

import {readFile} from "fs/promises";

/**
 * This defines the parameters for the blocklist import.
 * You should read through the available properties and configure everything before running this script.
 * @returns {Config}
 */
function makeConfig() {
    return {
        // If true, then existing blocks will be revoked if they do not exist in any blocklist.
        // Not implemented yet.
        retractBlocks: false,

        // If true, then blocks will not be saved to any instance.
        // Instead, the predicted actions will be printed to the console.
        dryRun: false,

        /**
         * List of blocklists to load, as an array of file paths.
         * At least one source list must be provided.
         * Entries will be de-duplicated by merging all duplicates and keeping all actions that appear at least once.
         *
         * Lists should be CSV files in the extended Mastodon format:
         *  * domain (string, required) - hostname of the instance to block.
         *  * severity (string) - one of 'suspend', 'silence', 'disconnect', or 'none'.
         *      * suspend - completely disconnects the instance (implies 'silence' and 'disconnect')
         *      * silence - hides posts and profiles from anyone who isn't following them.
         *      * disconnect - stops delivering local posts to the remote instance.
         *      * none - take no action (other fields still apply).
         *  * public_comment (string) - public block reason.
         *  * reject_media (boolean) - true if media attachments should be ignored.
         *  * reject_reports (boolean) - true if abuse reports should be ignored.
         *  * obfuscate (boolean) - true if the block should be unlisted, hidden, or obfuscated.
         *  * set_nsfw (boolean) - true if media from the instance should be flagged as NSFW.
         *  * reject_avatars (boolean) - true if profile avatars should be ignored.
         *  * reject_banners (boolean) - true if profile banner images should be ignored.
         *  * reject_backgrounds (boolean) - true if profile background images should be ignored.
         * @type {string[]}
         */
        blocklists: [
            //'transfem.social_2024.03-16_tier0.csv'
            'test.csv'
        ],

        // List of instances to apply blocks, as an array of SharkeyInstance or AkkomaInstance objects.
        // The first parameter is an instance host name, and the second is a valid session token (get this from the browser dev tools).
        // At least one instance must be provided.
        instances: [
            new SharkeyInstance('enby.life', ''),
            new SharkeyInstance('transfem.social', ''),
            new AkkomaInstance('transwo.men', '')
        ]
    };
}

// We put a single, shared timestamp here to ensure that all saved notes show the same message.
const startTimestamp = new Date();
const startDate = toYMD(startTimestamp);

class SharkeyInstance {
    /**
     * @param {string} host
     * @param {string} token
     */
    constructor(host, token) {
        this.host = host;
        this.token = token;
    }

    /**
     * @param {Block} block
     * @param {Config} config
     * @returns {Promise<BlockResult>}
     */
    async tryApplyBlock(block, config) {
        // Get current block status
        const instance = await this._getInstance(block.host);
        const meta = await this._getMeta();

        // Check for changes
        if (this._isUpToDate(instance, meta, block)) {
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
        if (!config.dryRun) {
            if (doSuspend) {
                await this._updateMeta({
                    blockedHosts: meta.blockedHosts.concat(block.host)
                });
            }

            if (doSilence) {
                await this._updateMeta({
                    silencedHosts: meta.silencedHosts.concat(block.host)
                });
            }

            if (doNSFW) {
                await this._updateInstance({
                    host: block.host,
                    isNSFW: instance.isNSFW || block.setNSFW
                });
            }

            if (doStop) {
                await this._updateInstance({
                    host: block.host,
                    isSuspended: instance.isSuspended || block.disconnect
                });
            }

            if (doModNote) {
                const blockType = isNewBlock ? 'created' : 'updated';
                const blockReason = block.reason || 'unspecified'
                const newModNote = `${startDate}: list import; ${blockType} block for [${blockReason}].`

                // Preserve any existing note.
                // Sharkey uses newlines (\n) directly, which makes this easy.
                const finalModNote = instance.moderationNote
                    ? `${instance.moderationNote}\n${newModNote}`
                    : newModNote;

                await this._updateInstance({
                    host: block.host,
                    moderationNote: finalModNote
                });
            }
        }

        return isNewBlock
            ? 'created'
            : 'updated';
    }

    /**
     * @param {string} host
     * @returns {Promise<SharkeyInstanceEntity | null>}
     * @private
     */
    async _getInstance(host) {
        const resp = await fetch(`https://${this.host}/api/federation/show-instance`, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                host,
                i: this.token
            })
        });

        if (!resp.ok) {
            throw new Error(`Failed to query instance ${host}, got status ${resp.status} ${resp.statusText}`);
        }
        if (resp.status === 204) {
            return null;
        }

        return await resp.json();
    }

    /**
     * @param {Partial<SharkeyInstanceEntity>} instance
     * @returns {Promise<void>}
     * @private
     */
    async _updateInstance(instance) {
        const body = Object.assign({}, instance, { i: this.token });
        const resp = await fetch(`https://${this.host}/api/admin/federation/update-instance`, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!resp.ok) {
            throw new Error(`Failed to update instance ${instance.host}, got status ${resp.status} ${resp.statusText}`);
        }
    }

    /**
     * @returns {Promise<SharkeyMetaEntity>}
     * @private
     */
    async _getMeta() {
        const resp = await fetch(`https://${this.host}/api/admin/meta`, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                i: this.token
            })
        });

        if (!resp.ok) {
            throw new Error(`Failed to query instance metadata, got status ${resp.status} ${resp.statusText}`);
        }

        return await resp.json();
    }

    /**
     * @param {Partial<SharkeyMetaEntity>} meta
     * @returns {Promise<void>}
     * @private
     */
    async _updateMeta(meta) {
        const body = Object.assign({}, meta, { i: this.token });
        const resp = await fetch(`https://${this.host}/api/admin/update-meta`, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!resp.ok) {
            throw new Error(`Failed to update instance metadata, got status ${resp.status} ${resp.statusText}`);
        }
    }

    /**
     * @param {SharkeyInstanceEntity | null} instance
     * @param {SharkeyMetaEntity} meta
     * @param {Block} block
     * @returns {boolean}
     * @private
     */
    _isUpToDate(instance, meta, block) {
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
}


/**
 * @typedef SharkeyInstanceEntity
 * @property {string} host
 * @property {boolean} isSuspended
 * @property {boolean} isBlocked
 * @property {boolean} isSilenced
 * @property {boolean} isNSFW
 * @property {string} moderationNote
 */

/**
 * @typedef SharkeyMetaEntity
 * @property {string[]} silencedHosts
 * @property {string[]} blockedHosts
 */

class AkkomaInstance {
    /**
     * @param {string} host
     * @param {string} token
     */
    constructor(host, token) {
        this.host = host;
        this.token = token;
    }

    /**
     * @param {Block} block
     * @param {Config} config
     * @returns {Promise<BlockResult>}
     */
    async tryApplyBlock(block, config) {
        // Read config
        const instanceConfig = await this._readConfig();
        const mrfSimpleSection = this._findMRFSection(instanceConfig, ':pleroma', ':mrf_simple');
        const mrfSection = this._findMRFSection(instanceConfig, ':pleroma', ':mrf');

        // Unpack tuple objects.
        // Each one is a list of [domain, block reason] pairs for a particular category (but in a really weird format).
        const federatedTimelineRemoval = this._findTuple(mrfSimpleSection, ':federated_timeline_removal');
        const reject = this._findTuple(mrfSimpleSection, ':reject');
        const followersOnly = this._findTuple(mrfSimpleSection, ':followers_only');
        const mediaRemoval = this._findTuple(mrfSimpleSection, ':media_removal');
        const mediaNSFW = this._findTuple(mrfSimpleSection, ':media_nsfw');
        const accept = this._findTuple(mrfSimpleSection, ':accept');
        const reportRemoval = this._findTuple(mrfSimpleSection, ':report_removal');
        const avatarRemoval = this._findTuple(mrfSimpleSection, ':avatar_removal');
        const bannerRemoval = this._findTuple(mrfSimpleSection, ':banner_removal');
        const backgroundRemoval = this._findTuple(mrfSimpleSection, ':background_removal');
        const transparencyExclusions = this._findTuple(mrfSection, ':transparency_exclusions');

        // Find current blocks
        const existingUnlist = federatedTimelineRemoval.find(t => t.tuple[0] === block.host);
        const existingSuspend = reject.find(t => t.tuple[0] === block.host);
        const existingSilence = followersOnly.find(t => t.tuple[0] === block.host);
        const existingRejectMedia = mediaRemoval.find(t => t.tuple[0] === block.host);
        const existingRejectAvatars = avatarRemoval.find(t => t.tuple[0] === block.host);
        const existingRejectBanners = bannerRemoval.find(t => t.tuple[0] === block.host);
        const existingRejectBackgrounds = backgroundRemoval.find(t => t.tuple[0] === block.host);
        const existingSetNSFW = mediaNSFW.find(t => t.tuple[0] === block.host);
        const existingDisconnect = accept.find(t => t.tuple[0] === block.host);
        const existingRejectReports = reportRemoval.find(t => t.tuple[0] === block.host);
        const existingTransparencyExclusions = transparencyExclusions.find(t => t.tuple[0] === block.host);

        // Compute current state
        const isUnlisted = !!existingUnlist;
        const isSuspended = !!existingSuspend;
        const isSilenced = !!existingSilence;
        const isMediaRejected = !!existingRejectMedia;
        const isAvatarRejected = !!existingRejectAvatars;
        const isBannerRejected = !!existingRejectBanners;
        const isBackgroundRejected = !!existingRejectBackgrounds;
        const isSetNSFW = !!existingSetNSFW;
        const isDeliveryStopped = !!existingDisconnect;
        const isReportRejected = !!existingRejectReports;
        const isTransparencyExcluded = !!existingTransparencyExclusions;
        const hasExistingBlock = isUnlisted || isSuspended || isSilenced || isMediaRejected || isAvatarRejected || isBannerRejected || isBackgroundRejected || isSetNSFW || isDeliveryStopped || isReportRejected || isTransparencyExcluded;

        // Compute changes
        const doUnlist = block.unlist && !isUnlisted;
        const doSuspend = block.suspend && !isSuspended;
        const doSilence = block.silence && !isSilenced;
        const doRejectMedia = block.rejectMedia && !isMediaRejected;
        const doRejectAvatars = block.rejectAvatars && !isAvatarRejected;
        const doRejectBanners = block.rejectBanners && !isBannerRejected;
        const doRejectBackgrounds = block.rejectBackgrounds && !isBackgroundRejected;
        const doSetNSFW = block.setNSFW && !isSetNSFW;
        const doDisconnect = block.disconnect && !isDeliveryStopped;
        const doRejectReports = block.rejectReports && !isReportRejected;
        const doExcludeTransparency = block.redact && !isTransparencyExcluded;
        const hasBlockChanges = doUnlist || doSuspend || doSilence || doRejectMedia || doRejectAvatars || doRejectBanners || doRejectBackgrounds || doSetNSFW || doDisconnect || doRejectReports || doExcludeTransparency;

        // Check for changes
        if (!hasBlockChanges) {
            return 'skipped';
        }

        // Add or update all blocks.
        // (this is kinda gross, should refactor)
        if (doUnlist)
            federatedTimelineRemoval.push({ tuple: [block.host, block.reason] });
        else if (isUnlisted && block.reason)
            existingUnlist.tuple[1] = block.reason;

        if (doSuspend)
            reject.push({ tuple: [block.host, block.reason] });
        else if (isSuspended && block.reason)
            existingSuspend.tuple[1] = block.reason;

        if (doSilence)
            followersOnly.push({ tuple: [block.host, block.reason] });
        else if (isSilenced && block.reason)
            existingSilence.tuple[1] = block.reason;

        if (doRejectMedia)
            mediaRemoval.push({ tuple: [block.host, block.reason] });
        else if (isMediaRejected && block.reason)
            existingRejectMedia.tuple[1] = block.reason;

        if (doRejectAvatars)
            avatarRemoval.push({ tuple: [block.host, block.reason] });
        else if (isAvatarRejected && block.reason)
            existingRejectAvatars.tuple[1] = block.reason;

        if (doRejectBanners)
            bannerRemoval.push({ tuple: [block.host, block.reason] });
        else if (isBannerRejected && block.reason)
            existingRejectBanners.tuple[1] = block.reason;

        if (doRejectBackgrounds)
            backgroundRemoval.push({ tuple: [block.host, block.reason] });
        else if (isBackgroundRejected && block.reason)
            existingRejectBackgrounds.tuple[1] = block.reason;

        if (doSetNSFW)
            mediaNSFW.push({ tuple: [block.host, block.reason] });
        else if (isSetNSFW && block.reason)
            existingSetNSFW.tuple[1] = block.reason;

        if (doDisconnect)
            accept.push({ tuple: [block.host, block.reason] });
        else if (isDeliveryStopped && block.reason)
            existingDisconnect.tuple[1] = block.reason;

        if (doRejectReports)
            reportRemoval.push({ tuple: [block.host, block.reason] });
        else if (isReportRejected && block.reason)
            existingRejectReports.tuple[1] = block.reason;

        // Don't set a reason for transparency - the semantics are different.
        if (doExcludeTransparency)
            transparencyExclusions.push({ tuple: [block.host, ''] });

        // Save changes
        if (!config.dryRun) {
            await this._saveConfig({
                configs: [
                    mrfSimpleSection,
                    mrfSection
                ],
                needs_reboot: false
            });
        }

        return hasExistingBlock ? 'updated' : 'created';
    }

    /**
     * @param {PleromaConfigEntity} config
     * @param {string} group
     * @param {string} key
     * @returns {PleromaMRFSection}
     * @private
     */
    _findMRFSection(config, group, key) {
        const mrfSimple = config.configs.find(c => c.group === group && c.key === key);
        if (!mrfSimple) {
            throw new Error(`Failed to read instance config, can't find ${group}/${key} in the response`);
        }

        return (/** @type {PleromaMRFSection} */(mrfSimple));
    }

    /**
     * Returns an array of [domain, block reason] tuples for the given category
     * @param {PleromaMRFSection} config
     * @param {string} key
     * @returns {PleromaTuple<string>[]}
     * @private
     */
    _findTuple(config, key) {
        // Happy path - it already exists in the config
        for (const entry of config.value) {
            if (entry.tuple[0] === key) {
                return entry.tuple[1];
            }
        }

        // Sad (but most likely) path - it doesn't exist yet, so we need to create it.
        /** @type {PleromaTuple<string>[]} */
        const tupleData = [];

        // It's *extremely important* that we add the entry back to the original config object!
        // Otherwise, the changes will be detached and not sent back to the server.
        config.value.push({
            tuple: [key, tupleData]
        });

        // We also need to update that "db" property, if it exists.
        config.db?.push(key);

        return tupleData;
    }

    /**
     * @returns {Promise<PleromaConfigEntity>}
     * @private
     */
    async _readConfig() {
        const resp = await fetch(`https://${this.host}/api/v1/pleroma/admin/config`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${this.token}`
            }
        });

        if (!resp.ok) {
            throw new Error(`Failed to read instance config, got status ${resp.status} ${resp.statusText}`);
        }

        return await resp.json();
    }

    /**
     * @param {PleromaConfigEntity} config
     * @returns {Promise<void>}
     * @private
     */
    async _saveConfig(config) {
        const resp = await fetch(`https://${this.host}/api/v1/pleroma/admin/config`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json;charset=utf-8',
                Accept: 'application/json',
                Authorization: `Bearer ${this.token}`
            },
            body: JSON.stringify(config)
        });

        if (!resp.ok) {
            throw new Error(`Failed to save instance config, got status ${resp.status} ${resp.statusText}`);
        }
    }
}

/**
 * @typedef PleromaConfigEntity
 * @property {PleromaConfig<unknown>[]} configs
 * @property {boolean} [needs_reboot]
 */
/**
 * @template T
 * @typedef PleromaConfig
 * @property {string} group
 * @property {string} key
 * @property {T} value
 * @property {string[]} [db]
 */
/**
 * @template T
 * @typedef PleromaTuple
 * @property {[string, T]} tuple
 */
/** @typedef {PleromaConfig<PleromaTuple<PleromaTuple<string>[]>[]>} PleromaMRFSection */

/** @typedef {SharkeyInstance | AkkomaInstance} Instance */
/** @typedef {'created' | 'updated' | 'skipped' | 'ignored'} BlockResult */

/**
 * @typedef Block
 * @property {string} host
 * @property {string} reason
 * @property {boolean} redact
 * @property {boolean} suspend
 * @property {boolean} silence
 * @property {boolean} unlist
 * @property {boolean} disconnect
 * @property {boolean} rejectMedia
 * @property {boolean} rejectAvatars
 * @property {boolean} rejectBanners
 * @property {boolean} rejectBackgrounds
 * @property {boolean} rejectReports
 * @property {boolean} setNSFW
 */

/**
 * @typedef Config
 * @property {boolean} retractBlocks
 * @property {boolean} dryRun
 * @property {string[]} blocklists
 * @property {Instance[]} instances
 */

/** @typedef {string[] & MastodonCSVProperties} MastodonCSVRow */
/**
 * @typedef MastodonCSVProperties
 * @property {string} domain
 * @property {'suspend' | 'silence' | 'none' | 'unlist' | 'disconnect'} [severity]
 * @property {string} [public_comment]
 * @property {'True'|'False'} [reject_media]
 * @property {'True'|'False'} [reject_avatars]
 * @property {'True'|'False'} [obfuscate]
 * @property {'True'|'False'} [set_nsfw]
 * @property {'True'|'False'} [reject_banners]
 * @property {'True'|'False'} [reject_backgrounds]
 * @property {'True'|'False'} [reject_reports]
 */

/**
 * @returns {Promise<void>}
 */
async function runImport() {
    const config = makeConfig();

    if (config.blocklists.length < 1) {
        console.info('No blocklists defined - exiting.')
        return;
    }

    if (config.instances.length < 1) {
        console.info('No instances defined - exiting.');
        return;
    }

    if (config.retractBlocks) {
        console.warn('Ignoring retractBlocks - retraction is not implemented.');
    }

    if (config.dryRun) {
        console.info('Dry run requested - blocks will not be saved.');
    }

    // Read and merge all blocklists
    const blocks = await loadBlocksFromLists(config.blocklists);
    if (blocks.length > 0)
        console.info(`Loaded ${blocks.length} unique block(s) from ${config.blocklists.length} source list(s).\n`);
    else
        console.warn('No blocks were loaded - please check the script config and source lists.');

    // Apply all blocks to all instances
    for (const block of blocks) {
        const actions = getBlockActions(block);
        if (actions.length > 0) {
            const actionString = concatBlockActions(actions);
            const ending = block.redact ? ' (redacted).' : '.';
            console.info(`${block.host}: ${actionString} for "${block.reason}"${ending}`);
        } else {
            console.warn(`${block.host}: no actions defined, block will be skipped.`);
            continue;
        }

        for (const instance of config.instances) {
            try {
                const result = await instance.tryApplyBlock(block, config);

                if (result === 'created') {
                    console.info(`  created block on ${instance.host}.`);
                } else if (result === 'updated') {
                    console.info(`  updated block on ${instance.host}.`);
                } else if (result === 'ignored') {
                    console.info(`  skipped ${instance.host} - does not support this block.`);
                } else {
                    console.info(`  skipped ${instance.host} - already blocks this domain.`);
                }
            } catch (e) {
                console.error(`  failed ${instance.host} - an error was thrown:`, e);
            }
        }

        console.info('');
    }
}

/**
 * @param {Block} block
 * @returns {string[]}
 */
function getBlockActions(block) {
    const actions = [];
    if (block.suspend) actions.push('suspend');
    if (block.silence) actions.push('silence');
    if (block.unlist) actions.push('unlist');
    if (block.disconnect) actions.push('disconnect');
    if (block.rejectMedia) actions.push('reject media');
    if (block.rejectAvatars) actions.push('reject avatars');
    if (block.rejectBanners) actions.push('reject banners');
    if (block.rejectBackgrounds) actions.push('reject backgrounds');
    if (block.rejectReports) actions.push('reject reports');
    if (block.setNSFW) actions.push('set NSFW');
    return actions;
}

/**
 * @param {string[]} actions
 * @returns {string}
 */
function concatBlockActions(actions) {
    // A single action.
    if (actions.length < 2)
        return actions[0];

    // Two actions: format as "this and that".
    if (actions.length === 2)
        return actions.join(' and ');

    // Three+ actions: format as "this, that, and the other".
    const first = actions.slice(0, -1).join(', ');
    return `${first}, and ${actions.at(-1)}`;
}

/**
 * @param {string[]} lists
 * @returns {Promise<Block[]>}
 */
async function loadBlocksFromLists(lists) {
    /** @type {Map<string, Block>} */
    const uniqueBlocks = new Map();

    for (const listPath of lists) {
        const listBlocks = await loadBlocksFromMastodonCSV(listPath);

        for (const block of listBlocks) {
            const duplicateBlock = uniqueBlocks.get(block.host);
            if (duplicateBlock) {
                console.info(`Merging duplicate block entries for ${block.host}.`);
                block.reason = `${block.reason} | ${duplicateBlock.reason}`;
                block.suspend ||= duplicateBlock.suspend;
                block.silence ||= duplicateBlock.silence;
                block.unlist ||= duplicateBlock.unlist;
                block.disconnect ||= duplicateBlock.disconnect;
                block.rejectMedia ||= duplicateBlock.rejectMedia;
                block.rejectAvatars ||= duplicateBlock.rejectAvatars;
                block.rejectBanners ||= duplicateBlock.rejectBanners;
                block.rejectBackgrounds ||= duplicateBlock.rejectBackgrounds;
                block.rejectReports ||= duplicateBlock.rejectReports;
                block.redact ||= duplicateBlock.redact;
                block.setNSFW ||= duplicateBlock.setNSFW;
            }
            uniqueBlocks.set(block.host, block);
        }
    }

    return Array.from(uniqueBlocks.values());
}

/**
 * @param {string} path
 * @returns {Promise<Block[]>}
 */
async function loadBlocksFromMastodonCSV(path) {
    /** @type {MastodonCSVRow[]} */
    const rows = await parseCSVFile(path, true, true);
    return rows.map(r => {
        const severity = r.severity?.toLowerCase();
        return {
            host: r.domain,
            reason: r.public_comment?.replaceAll(/\r?\n/g, ' ') ?? '',
            suspend: severity === 'suspend',
            silence: severity === 'suspend' || severity === 'silence',
            unlist: severity === 'suspend' || severity === 'silence' || severity === 'unlist',
            disconnect: severity === 'suspend' || severity === 'disconnect',
            rejectMedia: r.reject_media?.toLowerCase() === 'true',
            rejectAvatars: r.reject_avatars?.toLowerCase() === 'true',
            rejectBanners: r.reject_banners?.toLowerCase() === 'true',
            rejectBackgrounds: r.reject_backgrounds?.toLowerCase() === 'true',
            rejectReports: r.reject_reports?.toLowerCase() === 'true',
            redact: r.obfuscate?.toLowerCase() === 'true',
            setNSFW: r.set_nsfw?.toLowerCase() === 'true'
        };
    });
}

/**
 * @template {string[]} T
 * @param {string} path
 * @param {boolean} hasHeader
 * @param {boolean} mapColumns
 * @returns {Promise<T[]>}
 */
async function parseCSVFile(path, hasHeader, mapColumns) {
    const text = await readFile(path, 'utf-8');
    return parseCSVText(text, hasHeader, mapColumns);
}

/**
 * @template {string[]} T
 * @param {string} text
 * @param {boolean} hasHeader
 * @param {boolean} mapColumns
 * @returns {T[]}
 */
function parseCSVText(text, hasHeader, mapColumns) {
    if (mapColumns && !hasHeader) {
        throw new Error('Parsing error: bad CSV settings; hasHeader must be true if mapColumns is true');
    }

    /** @type {string[][]} */
    const rows = [];

    // Return all fields in a single, flat array.
    // This will contain some bad values like blank lines, but they will be filtered by popCSVLine.
    /** @type {string[][]} */
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

    // This is just casting string[] to T[] with JSDoc syntax
    return (/** @type {T[]} */(/** @type {unknown[]} */(rows)));
}

/**
 * @param {string[][]} fields
 * @param {number | null} numExpectedCells
 * @returns {string[] | null}
 */
function popCSVLine(fields, numExpectedCells) {
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

    /** @type {string[]} */
    const row = [];

    for (let match = fields.shift(); !!match; match = fields.shift()) {
        const cell = parseCell(match[0]);
        row.push(cell);

        // EOL will be an empty string if this is the last field in the row.
        if (match[2] === '') {
            break;
        }
    }

    if (numExpectedCells != null && row.length !== numExpectedCells) {
        throw new Error(`Parsing error: found ${row.length} fields, but expected ${numExpectedCells}`);
    }

    return row;
}

/**
 * @param {string} cell
 * @returns {string}
 */
function parseCell(cell) {
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

/**
 * @param {Date} date
 * @returns {string}
 */
function toYMD(date) {
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

// Run it!
await runImport();
