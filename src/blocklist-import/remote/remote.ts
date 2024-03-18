import {Block} from "../domain/block.js";
import {BlockResult} from "../domain/blockResult.js";
import {SharkeyRemote} from "./SharkeyRemote.js";
import {PleromaRemote} from "./PleromaRemote.js";
import {Config, RemoteConfig} from "../domain/config.js";

export interface Remote {
    /**
     * Hostname of this remote.
     */
    readonly host: string;

    /**
     *
     */
    readonly stats: Readonly<RemoteStats>;

    /**
     * Attempts to apply the provided block to the instance, returning the result of the operation
     * @param block Block to apply
     */
    tryApplyBlock(block: Block): Promise<BlockResult>;
}

export interface RemoteStats {
    /**
     * Number of new blocks added in this session.
     * Each domain is counted only once, even if multiple actions are taken.
     */
    createdBlocks: number;

    /**
     * Number of existing blocks that were changed in this session.
     * Each domain is counted only once, even if multiple actions are taken.
     */
    updatedBlocks: number;

    /**
     * Number of inward follow relations that have been blocked during this session.
     * An inward follow relation is a remote user who follows a local user.
     * Undefined if the remote does not track this information.
     */
    lostFollowers?: number;

    /**
     * Number of outward follow relations that have been blocked during this session.
     * An outward follow relation is a local user who follows a remote user.
     * Undefined if the remote does not track this information.
     */
    lostFollows?: number;
}

export function createRemote({type, host, token}: RemoteConfig, config: Config): Remote {
    if (type === 'sharkey')
        return new SharkeyRemote(config, host, token);

    if (type === 'pleroma' || type === 'akkoma')
        return new PleromaRemote(config, host, token);

    throw new Error(`Unknown remote type: ${type}`);
}
