import type { ProviderAttemptResult } from "./index";

export async function createClickAttempt(_: any): Promise<ProviderAttemptResult> {
  throw new Error("provider_not_enabled_in_stage1:click");
}
