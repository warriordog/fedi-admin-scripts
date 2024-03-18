import {Block} from "../domain/block.js";
import {BlockResult} from "../domain/blockResult.js";
import {SharkeyRemote} from "./SharkeyRemote.js";
import {AkkomaRemote} from "./AkkomaRemote.js";
import {Config, RemoteConfig, RemoteType} from "../domain/config.js";

export interface Remote {
    /**
     * Hostname of this remote.
     */
    readonly host: string;

    /**
     * Attempts to apply the provided block to the instance, returning the result of the operation
     * @param block Block to apply
     */
    tryApplyBlock(block: Block): Promise<BlockResult>;
}

export function createRemote({type, host, token}: RemoteConfig, config: Config): Remote {
    if (type === 'sharkey')
        return new SharkeyRemote(config, host, token);

    if (type === 'akkoma')
        return new AkkomaRemote(config, host, token);

    throw new Error(`Unknown remote type: ${type}`);
}
