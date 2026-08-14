import { redirect } from "next/navigation"

import { DEFAULT_LOCALE } from "@/lib/i18n"

// The product is pitched on ai.krafta.org/uz, so the locale lives in the path
// and the bare root is just a doorway to the default one.
export default function RootPage() {
  redirect(`/${DEFAULT_LOCALE}`)
}
