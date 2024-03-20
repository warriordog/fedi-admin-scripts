import {Block} from "../domain/block.js";
import {BlockResult} from "../domain/blockResult.js";
import {SharkeyRemote} from "./SharkeyRemote.js";
import {PleromaRemote} from "./PleromaRemote.js";
import {Config, RemoteConfig} from "../domain/config.js";
import {Post} from "../domain/post.js";

export interface Remote {
    /**
     * Hostname of this remote.
     */
    readonly host: string;

    /**
     * Statistics of the block actions taken so far.
     */
    readonly stats: Readonly<RemoteStats>;

    /**
     * Attempts to apply the provided block to the instance, returning the result of the operation
     * @param block Block to apply
     */
    tryApplyBlock(block: Block): Promise<BlockResult>;

    /**
     * Returns the maximum length of a post that this remote will accept.
     * Measured in characters.
     */
    getMaxPostLength(): Promise<number>;

    /**
     * Publishes a post from the current user's account.
     * @returns URL of the uploaded post.
     */
    publishPost(post: Post): Promise<string>;
}

export interface RemoteStats {
    /**
     * All new blocks that were created in this session.
     */
    createdBlocks: Block[];

    /**
     * All existing blocks that were updated in this session.
     */
    updatedBlocks: Block[];

    /**
     * All blocks that could not be processed due to an unsupported mode or flag.
     */
    unsupportedBlocks: Block[];

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

// TODO track errors

export function createRemote({type, host, token}: RemoteConfig, config: Config): Remote {
    if (type === 'sharkey')
        return new SharkeyRemote(config, host, token);

    if (type === 'pleroma' || type === 'akkoma')
        return new PleromaRemote(config, host, token);

    throw new Error(`Unknown remote type: ${type}`);
}
