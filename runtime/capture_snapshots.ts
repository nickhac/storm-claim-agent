import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { download_bom_xml } from "../tools/check_bom_warning.js";
import { download_postcode } from "../tools/verify_postcode.js";
import { load_dotenv, load_settings, root_dir } from "../tools/types.js";

/** Fetch live BOM and AusPost payloads into snapshots/. */
async function capture_snapshots(): Promise<void> {
  load_dotenv();
  const settings = load_settings();
  const bom_dir = path.join(root_dir, settings.snapshots.bom_dir);
  const postcode_dir = path.join(root_dir, settings.snapshots.auspost_dir);
  mkdirSync(bom_dir, { recursive: true });
  mkdirSync(postcode_dir, { recursive: true });

  for (const state of Object.keys(settings.endpoints.bom_products)) {
    const xml = await download_bom_xml(state);
    const file_path = path.join(bom_dir, `${state}.xml`);
    writeFileSync(file_path, xml);
    console.log(`wrote ${path.relative(root_dir, file_path)} (${xml.length} bytes)`);
  }

  for (const postcode of settings.snapshots.postcodes) {
    const payload = await download_postcode(postcode);
    const file_path = path.join(postcode_dir, `${postcode}.json`);
    writeFileSync(file_path, JSON.stringify(payload));
    console.log(`wrote ${path.relative(root_dir, file_path)}`);
  }

  console.log(`left ${settings.snapshots.hail_fixture} in place`);
}

capture_snapshots().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`capture_snapshots: ${message}`);
  process.exit(1);
});
