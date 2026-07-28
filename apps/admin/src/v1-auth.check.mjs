import assert from "node:assert/strict";
import { v1AuthPayload } from "./v1-auth.js";

assert.deepEqual(
  v1AuthPayload({
    email: "  owner@example.com  ",
    password: "correct horse battery staple",
  }),
  {
    email: "owner@example.com",
    password: "correct horse battery staple",
  },
);

assert.deepEqual(
  v1AuthPayload(
    {
      email: "owner@example.com",
      password: "correct horse battery staple",
      bootstrapToken: "one-time-setup-token",
    },
    { setup: true },
  ),
  {
    email: "owner@example.com",
    password: "correct horse battery staple",
    bootstrapToken: "one-time-setup-token",
  },
);

assert.equal(
  Object.hasOwn(
    v1AuthPayload({ email: "owner@example.com", password: "secret" }),
    "bootstrapToken",
  ),
  false,
);

console.log("admin v1 auth payload ok");
