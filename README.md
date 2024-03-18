# fedi-admin-scripts

Small collection of scripts, tools, and queries meant for use by fediverse system administrators.
These scripts are meant for use with Sharkey and/or Akkoma, but can be adapted for other server software.

## Scripts:

### blocklist-import: synchronize domain blocks across servers

This script connects to multiple remote instances and applies a common set of domain blocks.
One or more mastodon-format domain blocklists can be loaded, and the included blocks will be added to all attached instances. The tooling will automatically merge domains that appear in multiple entries, and remote instances are introspected to ensure that blocks are never duplicated on the server. Both Sharkey and Akkoma are supported.

Additionally, the script ~~can~~ *will soon be able to* generate block announcement posts including domain, actions taken, and reasons. Posts are returned in markdown format for easy posting on any instance software.

#### Usage:

This script is currently rather difficult to use, due to the lack of a proper authentication method. You will need to capture a session token for your admin account(s) before running the script. (see step 3 for more details.)

1. Add blocklists to the `data` directory (or another accessible location).
2. Copy `config/importBlocklist.example.js` to `config/importBlocklist.js` and fill out the "sources" property. For each list, add a line like this: `{ type: 'mastodon', path: 'data/whatever-block-list.csv' },`.
3. Fill out the "remotes" property with connection details for your instance(s). Use the provided examples, and be sure to change the "host" property to match. The "token" should be an active session token from an admin account - you can get this through the web browser dev tools. Hint: for sharkey, capture a `POST` request and look for the `i` property. For Akkoma, open Admin-FE and take the `Authorization` header from any request. Remove the `Bearer` part and any whitespace.
4. Run `npm install` (you only have to do this once)
5. Run `npm run import-blocklist` and the script will begin importing blocks. Progress will be printed for each block and instance.

#### Tips:

* You can set `dryRun` to `true` in order to test your configuration and connection settings. All blocks will be processed, but no changes will be saved to the instances.
* If you get any kind of error like "unauthorized" or "unauthenticated", then check your access tokens. They may need to be replaced if much time has passed.
