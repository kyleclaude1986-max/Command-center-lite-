import { runSeed } from "../lib/seed";

const created = runSeed();
console.log(created === 0 ? "seed already applied" : `seed applied, ${created} rows created`);
