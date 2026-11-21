import { z } from "zod";
export const authSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(12, "Use at least 12 characters").max(128),
});
export const circleSchema = z.object({
  name: z.string().trim().min(3).max(60),
  contribution_rupees: z.coerce.number().positive().max(1_000_000),
});
export const inviteSchema = z.string().trim().regex(/^[A-Z0-9]{8}$/, "Invite codes are 8 letters/digits");
export const toPaise = (r: number) => Math.round(r * 100);
export const inr = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
