import {SharkeyFastRemote} from "./fast/SharkeyFastRemote.js";
import {SharkeyRemote} from "./standard/SharkeyRemote.js";
import {PleromaFastRemote} from "./fast/PleromaFastRemote.js";
import {PleromaRemote} from "./standard/PleromaRemote.js";
import {Remote} from "./Remote.js";
import {defaultRemoteSettings} from "./remoteSettings.js";
import {RemoteConnection} from "../util/connectionString.js";

export type RemoteType = 'sharkey' | 'pleroma' | 'akkoma';

export function isRemoteType(type: string): type is RemoteType {
    return type === 'sharkey' || type === 'pleroma' || type === 'akkoma';
}

export function createRemote({type, host, token}: RemoteConnection, settings = defaultRemoteSettings): Remote {
    if (type === 'sharkey') {
        return settings.fastMode
            ? new SharkeyFastRemote(settings, host, token)
            : new SharkeyRemote(settings, host, token);
    }

    if (type === 'pleroma' || type === 'akkoma') {
        return settings.fastMode
            ? new PleromaFastRemote(settings, host, token)
            : new PleromaRemote(settings, host, token);
    }

    throw new Error(`Unknown remote type: ${type}`);
}