import type { ProviderAttemptResult } from "./index";

export async function createPaymeAttempt(_: any): Promise<ProviderAttemptResult> {
  throw new Error("provider_not_enabled_in_stage1:payme");
}
