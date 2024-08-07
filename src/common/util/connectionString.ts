import {isRemoteType, RemoteType} from "../remote/createRemote.js";

/**
 * Defines a connection to a remote instance,
 */
export interface RemoteConnection {
    /**
     * Type of instance software to connect to.
     */
    readonly type: RemoteType;

    /**
     * Hostname / domain of the instance.
     */
    readonly host: string;

    /**
     * Authentication token for a user with administrative permissions on the instance.
     */
    readonly token: string;
}

/**
 * Parses a connection string into a definition object.
 * @param connectionString Connection string in type://token@host format.
 * @throws {Error} When connection is malformed.
 * @throw {Error} When type is unsupported.
 */
export function parseConnectionString(connectionString: string): RemoteConnection {
    const [_, type, token, host] = connectionString.match(/^(\w+):\/\/([^@]+)@([\w-.]+)$/) ?? [null, null, null, null];
    if (!type || !token || !host) {
        throw new Error(`Connection string is invalid; software, token, and host are required: "${connectionString}"`);
    }

    if (!isRemoteType(type)) {
        throw new Error(`Connection string is invalid; unsupported software: "${type}"`);
    }

    return { type, host, token };
}