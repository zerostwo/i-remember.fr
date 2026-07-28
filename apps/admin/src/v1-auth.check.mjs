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
  v1AuthPayload({
    email: "owner@example.com",
    password: "correct horse battery staple",
    totp: "123456",
  }),
  {
    email: "owner@example.com",
    password: "correct horse battery staple",
    totp: "123456",
  },
);

console.log("admin v1 auth payload ok");
