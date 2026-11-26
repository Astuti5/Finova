// Turns the short exception messages raised by the database functions into sentences a member can act on.
const RULES: [RegExp, string][] = [
  [/circle not started/, "The circle admin has to start the circle first."],
  [/already contributed this cycle/, "You have already paid for this cycle."],
  [/payment pending/, "A payment is already pending. Confirm it first."],
  [/circle already started/, "The circle has already started, so new members can no longer be approved."],
  [/already started/, "This circle has already been started."],
  [/need at least 2 members/, "A circle needs at least 2 members before it can start."],
  [/second admin/, "Ask the circle owner to make another member an admin first, so someone else can approve your loan."],
  [/insufficient funds/, "The circle pool does not have enough money for this."],
  [/open loan exists/, "You already have an open loan in this circle."],
  [/self-approval/, "You cannot approve your own loan."],
  [/already approved this loan/, "You have already approved this loan. Another admin must approve it too."],
  [/earlier installment/, "Pay the earlier installment first."],
  [/cycle not fully funded/, "Every member must pay for this cycle before its payout."],
  [/next payout cycle has not started/, "The next payout cycle has not started yet."],
  [/all payouts done/, "Every member has already received a payout."],
  [/gateway/, "This payment is confirmed by the payment gateway, not from this screen."],
  [/rate limited/, "Too many attempts. Try again later."],
  [/bad input/, "Please check the values you entered."],
  [/forbidden/, "You are not allowed to do that."],
];
export const friendly = (message: string | undefined, fallback = "Could not complete that action.") => RULES.find(([re]) => re.test(message ?? ""))?.[1] ?? fallback;

// supabase-js hides the body of a failed Edge Function call. This digs the real reason out.
export async function functionError(error: any, fn: string): Promise<string> {
  try {
    if (error?.context && typeof error.context.json === "function") {
      const b = await error.context.json();
      if (b?.error) return `${b.error}${b.missing ? ` Missing server secrets: ${b.missing.join(", ")}.` : ""}${b.wallet ? ` Wallet: ${b.wallet}.` : ""}${b.reason ? ` (${b.reason})` : ""}`;
    }
  } catch { /* fall through */ }
  if (error?.name === "FunctionsFetchError") return `Could not reach the ${fn} function. Is it deployed (supabase functions deploy ${fn}), and does ALLOWED_ORIGIN match this site's address exactly?`;
  if (error?.name === "FunctionsRelayError") return `Supabase could not start the ${fn} function. Check its logs in the Supabase dashboard.`;
  return "The request failed.";
}
