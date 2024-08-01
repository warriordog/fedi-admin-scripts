import {SharkeyFastRemote} from "./fast/SharkeyFastRemote.js";
import {SharkeyRemote} from "./standard/SharkeyRemote.js";
import {PleromaFastRemote} from "./fast/PleromaFastRemote.js";
import {PleromaRemote} from "./standard/PleromaRemote.js";
import {Remote} from "./Remote.js";
import {RemoteSettings} from "./remoteSettings.js";

export interface RemoteConfig {
    /**
     * Type of software in use on the remote instance.
     * Must be either "sharkey" or "pleroma".
     */
    type: RemoteType;

    /**
     * Domain / host name of the remote instance.
     */
    host: string;

    /**
     * Session token for a user with administrative permissions on this instance.
     */
    token: string;
}

export type RemoteType = 'sharkey' | 'pleroma' | 'akkoma';

export function isRemoteType(type: string): type is RemoteType {
    return type === 'sharkey' || type === 'pleroma' || type === 'akkoma';
}

export function createRemote({type, host, token}: RemoteConfig, settings: RemoteSettings): Remote {
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