import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const hostContract = defineRpcContract({
  mainAndSync: {
    input: z.object({ cwd: z.string().min(1) }).strict(),
    output: z.object({ ok: z.literal(true) }).strict(),
  },
});
