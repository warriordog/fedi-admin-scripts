import {importBlocklist} from "./importer.js";
import {readConfigFile} from "./domain/config.js";

const config = readConfigFile();
await importBlocklist(config);
