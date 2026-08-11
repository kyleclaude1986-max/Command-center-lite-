import { randomBytes } from "node:crypto";

const count = Number(process.argv[2] ?? 1);

for (let i = 0; i < count; i += 1) {
  console.log(randomBytes(32).toString("base64"));
}
