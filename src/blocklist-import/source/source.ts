import {SourceConfig} from "../domain/config.js";
import {Block} from "../domain/block.js";
import {readMastodonSource} from "./mastodonSource.js";

export async function readSource({type, path}: SourceConfig): Promise<Block[]> {
    if (type === 'mastodon')
        return await readMastodonSource(path);

    throw new Error(`Unknown source type: ${type}`);
}
