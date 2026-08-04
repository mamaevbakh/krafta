/**
 * Which query params survive a legacy-dashboard redirect.
 *
 * Extracted from the redirect itself so it can be asserted directly. The
 * failure this guards is silent rather than loud: the server actions in
 * `app/dashboard/actions.ts` report their result by redirecting back with
 * `?subError=…` or `?subPayUrl=…&subToken=…`, and if those are dropped in
 * transit the merchant sees a page that looks like nothing happened. The
 * natural response to that is to submit the same form again — which mints a
 * second customer and a second subscription. A dropped query param is a
 * duplicate-billing bug, not a cosmetic one, which is why it is worth a test.
 */

/**
 * `orgId` is the one param that must NOT survive. It is consumed upstream to
 * resolve the slug, and org-scoped routes authorize on the slug alone;
 * forwarding it would hand back the `?orgId=` enumeration surface those routes
 * were built to remove.
 */
const DROPPED = new Set(["orgId"]);

export function forwardQuery(
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const forwarded = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (DROPPED.has(key)) continue;
    // `undefined` shows up for a key Next parsed but that carried no value.
    if (typeof value === "string") forwarded.append(key, value);
    else if (Array.isArray(value)) for (const item of value) forwarded.append(key, item);
  }
  return forwarded.toString();
}
