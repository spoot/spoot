import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({
  path: process.argv.includes("--prod")
    ? ".env.prod.local"
    : ".env.staging.local",
});
