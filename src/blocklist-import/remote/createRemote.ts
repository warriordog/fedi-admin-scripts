import {Config, RemoteConfig} from "../../../config/importBlocklist.js";
import {SharkeyFastRemote} from "./fast/SharkeyFastRemote.js";
import {SharkeyRemote} from "./standard/SharkeyRemote.js";
import {PleromaFastRemote} from "./fast/PleromaFastRemote.js";
import {PleromaRemote} from "./standard/PleromaRemote.js";
import {Remote} from "./Remote.js";


export function createRemote({type, host, token}: RemoteConfig, config: Config): Remote {
    if (type === 'sharkey') {
        return config.fastMode
            ? new SharkeyFastRemote(config, host, token)
            : new SharkeyRemote(config, host, token);
    }

    if (type === 'pleroma' || type === 'akkoma') {
        return config.fastMode
            ? new PleromaFastRemote(config, host, token)
            : new PleromaRemote(config, host, token);
    }

    throw new Error(`Unknown remote type: ${type}`);
}
