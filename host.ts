import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import { hostContract } from "./contract.js";

const exec = promisify(execFile);

export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    async mainAndSync({ cwd }, { signal }) {
      await exec("git", ["switch", "main"], { cwd, signal });
      await exec("git", ["pull", "--ff-only"], { cwd, signal });
      return { ok: true as const };
    },
  },
});
