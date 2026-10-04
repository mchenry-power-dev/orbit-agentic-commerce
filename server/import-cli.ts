import { writeFile } from "node:fs/promises";
import { PublicImporter } from "./importer";
const args = process.argv.slice(2),
  urls: string[] = [];
let output = "";
for (let index = 0; index < args.length; index++) {
  if (args[index] === "--url" && args[index + 1]) urls.push(args[++index]);
  else if (args[index] === "--output" && args[index + 1])
    output = args[++index];
  else
    throw new Error(
      "Usage: npx tsx server/import-cli.ts --url https://public-site/ --output ../_work/import.json",
    );
}
if (!output)
  throw new Error(
    "Choose a local-only output path; never save visitor/import data in the public source tree.",
  );
const result = await new PublicImporter().import(
  urls,
  AbortSignal.timeout(30_000),
);
await writeFile(output, JSON.stringify(result, null, 2), { mode: 0o600 });
console.log(
  `Public import: ${result.sources.length} pages, ${result.images.length} decoded rasters, ${result.failures.length} failures. Product facts require confirmation.`,
);
if (!result.sources.length) process.exitCode = 1;
