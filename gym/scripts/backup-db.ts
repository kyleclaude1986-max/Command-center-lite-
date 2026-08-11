import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * An online snapshot of a live database, using SQLite's own backup API.
 *
 * Copying the file with cp is not equivalent and is not safe. In WAL mode most
 * recent writes are still in the -wal file, so a plain copy of the main file
 * silently loses them — which is exactly what happened the first time this was
 * run for real: four workouts in the database, two in the copy, and every set
 * missing. Doing it through the driver means there is no fallback path left to
 * get wrong.
 */
const source = resolve(process.env.SQLITE_PATH ?? "./data/gym.sqlite");
const target = resolve(process.argv[2] ?? "./backup.sqlite");

mkdirSync(dirname(target), { recursive: true });

const db = new Database(source, { readonly: true, fileMustExist: true });

db.backup(target)
  .then((result) => {
    db.close();
    console.log(`${source} -> ${target} (${result.totalPages} pages)`);
  })
  .catch((error: unknown) => {
    db.close();
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
