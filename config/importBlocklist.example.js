/**
 * This is an example configuration.
 * To use it, copy this to "importBlocklist.js" and make any desired changes.
 * At minimum, you must fill out the "sources" and "remotes" sections.
 *
 * For a description of these and other available settings, see "importBlocklist.d.ts".
 */
export default {
    sources: [
        { type: 'mastodon', path: 'data/domain-blocks.example.csv' }
    ],

    remotes: [
        { type: 'sharkey', host: 'sharkey.example.com', token: '' },
        { type: 'akkoma', host: 'akkoma.example.com', token: '' }
    ],

    dryRun: false
};
