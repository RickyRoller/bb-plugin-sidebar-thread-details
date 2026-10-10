import { z } from "zod";

export const appearanceSchema = z.object({
  projectColor: z.string().regex(/^$|^#[0-9a-fA-F]{6}$/),
  branchColor: z.string().regex(/^$|^#[0-9a-fA-F]{6}$/),
  threadColor: z.string().regex(/^$|^#[0-9a-fA-F]{6}$/),
  childThreadColor: z.string().regex(/^$|^#[0-9a-fA-F]{6}$/),
  threadIndent: z.number().int().min(8).max(40),
}).strict();

export type Appearance = z.infer<typeof appearanceSchema>;

export const defaultAppearance: Appearance = {
  projectColor: "",
  branchColor: "",
  threadColor: "",
  childThreadColor: "",
  threadIndent: 24,
};
