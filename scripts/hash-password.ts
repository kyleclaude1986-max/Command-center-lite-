import bcrypt from "bcryptjs";

const password = process.argv.slice(2).join(" ");
if (!password) {
  console.error("Usage: npm run hash-password -- 'your password'");
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);

console.log(hash);
console.log("");
console.log("Paste this line into your .env file exactly as printed.");
console.log("The backslashes matter: a bare $ is read as a variable and eats the hash.");
console.log("");
console.log(`AUTH_PASSWORD_HASH=${hash.replace(/\$/g, "\\$")}`);
