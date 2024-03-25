import {Manifest} from "./manifest.js";
import { mkdir, writeFile, rm } from "fs/promises";
import {Emoji, Meta} from "./meta.js";
import {Files} from "./files.js";
import {basename, join} from 'path';
import StreamZip from 'node-stream-zip';

const config = {
    manifestUrls: {
        'https://emoji-repo.absturztau.be/repo': 'manifest.json',
        'https://volpeon.ink/emojis/vlpn': 'manifest.json',
        'https://volpeon.ink/emojis/blobfox': 'manifest.json',
        'https://volpeon.ink/emojis/bunhd': 'manifest.json'
    },
    outDir: './data/emojis'
};

// Stats :neofox_hyper:
let numPacks = 0;
let numFiles = 0;

// Process each pack file
for (const [manifestUrl, manifestFile] of Object.entries(config.manifestUrls)) {
    // Prepare some metadata
    const host = new URL(manifestUrl).host;
    const exportedAt = new Date().toISOString();

    // Download each pack from the manifest
    const manifestJsonUrl = `${manifestUrl}/${manifestFile}`;
    const manifest = await fetchJson<Manifest>(manifestJsonUrl);
    for (const [packName, pack] of Object.entries(manifest)) {
        numPacks++;
        console.log(`Downloading pack ${numPacks}: ${manifestUrl} -> ${packName}`);

        // Prepare pack directory
        const packDir = join(config.outDir, packName);
        await mkdir(packDir, {recursive: true});

        // Download zip source
        const sourceBuffer = await fetchBuffer(pack.src);
        const sourcePath = `${config.outDir}/temp_${basename(pack.src)}`
        await writeFile(sourcePath, sourceBuffer);
        const source = new StreamZip.async({ file: sourcePath });

        // Extract each file
        const filesUrl = `${manifestUrl}/${pack.files}`;
        const files = await fetchJson<Files>(filesUrl);
        for (const fileName of Object.values(files)) {
            numFiles++;

            const filePath = join(packDir, fileName);
            await source.extract(fileName, filePath);
        }

        // Convert emojis
        const emojis: Emoji[] = Object
            .entries(files)
            .map(([emojiName, fileName]) => ({
                downloaded: true,
                fileName,
                emoji: {
                    name: emojiName,
                    category: packName,
                    aliases: []
                }
            })
        );
        const meta: Meta = {
            metaVersion: 2,
            host,
            exportedAt,
            emojis
        };

        // Write meta file
        const metaPath = join(packDir, 'meta.json');
        const metaJson = JSON.stringify(meta, null, 4);
        await writeFile(metaPath, metaJson, 'utf-8');

        // Write manifest file
        const manifestPath = join(packDir, 'manifest.json');
        const manifestJson = JSON.stringify({ [packName]: pack }, null, 4);
        await writeFile(manifestPath, manifestJson, 'utf-8');

        // Write files index
        const filesPath = join(packDir, pack.files);
        const filesJson = JSON.stringify(files);
        await writeFile(filesPath, filesJson, 'utf-8');

        // Cleanup, very important!
        await source.close();
        await rm(sourcePath);
    }
}

console.log(`Done, downloaded ${numPacks} packs and ${numFiles} files.`);

async function fetchJson<T>(url: string): Promise<T> {
    const resp = await fetch(url);
    if (!resp.ok)
        throw new Error(`Failed to fetch "${url}": got error ${resp.status} (${resp.statusText})`);

    return await resp.json() as T;
}

async function fetchBuffer(url: string): Promise<Buffer> {
    const resp = await fetch(url);
    if (!resp.ok)
        throw new Error(`Failed to fetch "${url}": got error ${resp.status} (${resp.statusText})`);

    const arrayBuffer = await resp.arrayBuffer();
    return Buffer.from(arrayBuffer);
}