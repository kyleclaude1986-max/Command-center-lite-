import { syncAll } from "../lib/sync/sources";

async function main() {
  await syncAll();
  console.log("sync complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
