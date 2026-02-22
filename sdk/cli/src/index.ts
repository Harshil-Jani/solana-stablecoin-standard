#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { globalOptions } from "./config";

import * as init from "./commands/init";
import * as mint from "./commands/mint";
import * as burn from "./commands/burn";
import * as freeze from "./commands/freeze";
import * as pause from "./commands/pause";
import * as status from "./commands/status";
import * as roles from "./commands/roles";
import * as minters from "./commands/minters";
import * as blacklist from "./commands/blacklist";
import * as seize from "./commands/seize";

yargs(hideBin(process.argv))
  .scriptName("sss-token")
  .usage("$0 <command> [options]")
  .option("keypair", globalOptions.keypair)
  .option("rpc-url", globalOptions["rpc-url"])
  .command(init)
  .command(mint)
  .command(burn)
  .command(freeze)
  .command(pause)
  .command(status)
  .command(roles)
  .command(minters)
  .command(blacklist)
  .command(seize)
  .demandCommand(1, "Specify a command to run")
  .strict()
  .help()
  .parse();
