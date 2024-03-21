import {SourceConfig} from "../domain/config.js";
import {Block} from "../domain/block.js";
import {readMastodonSource} from "./mastodonSource.js";
import {Remote} from "../remote/Remote.js";

export type Source = SourceConfig | RemoteSource;
export interface RemoteSource {
    type: 'remote';
    remote: Remote;
}

export async function readSource(source: Source): Promise<Block[]> {
    const type = source.type;

    if (type === 'mastodon')
        return await readMastodonSource(source.path);

    if (type === 'remote')
        return await source.remote.getBlocklist();

    throw new Error(`Unknown source type: ${type}`);
}
