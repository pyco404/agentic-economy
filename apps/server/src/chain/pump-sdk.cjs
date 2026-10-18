/* global module, require */
/* eslint-disable @typescript-eslint/no-require-imports -- select the SDK CommonJS entry for Node compatibility */
// SDK 4.1.0 needs its published CommonJS entry on Node; its ESM dependency
// chain imports BN from CommonJS Anchor. Keep this shim wallet/key agnostic.
module.exports = require("@pump-fun/pump-sdk");
