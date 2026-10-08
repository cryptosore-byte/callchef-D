// Import FIRST in a test: gives it a fresh, empty DATA_DIR so records from earlier runs cannot change the result.
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "rr-data-"));
