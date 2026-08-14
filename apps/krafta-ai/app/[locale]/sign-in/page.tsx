import { redirect } from "next/navigation"
import { LogIn } from "lucide-react"

import { BrandWordmark } from "@/components/brand/brand-wordmark"
import { ButtonLink } from "@/components/console/button-link"
import { SignInForm } from "@/components/console/sign-in-form"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"
import { hasSsoRuntimeConfig } from "@/lib/sso/config"
import { createClient } from "@/lib/supabase/server"
import { getDict, type Locale } from "@/lib/i18n"

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const { locale } = await params
  const { next, error } = await searchParams
  const dict = getDict(locale)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect(next && next.startsWith("/") ? next : `/${locale}`)

  const sso = hasSsoRuntimeConfig()

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-foreground text-background">
            <span className="text-sm font-bold tracking-tight">K</span>
          </div>
          <div className="leading-tight">
            <BrandWordmark className="text-base" />
            <div className="text-xs text-muted-foreground">
              {dict.brand.tagline}
            </div>
          </div>
        </div>

        {/*
          One error line for every failure mode. The reason arrives as a code
          (`sso_state_mismatch`, `sso_token_exchange_failed`) which is for our
          logs; a merchant is told the same thing either way, and a raw
          provider string would be untranslated and a hint to whoever is
          probing the endpoint.
        */}
        {error ? (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>{dict.auth.ssoFailed}</AlertTitle>
          </Alert>
        ) : null}

        {sso ? (
          /*
            Production: no password box at all. The merchant already has a
            Krafta account, and offering a second credential here would invite
            them to create one.
          */
          <Card>
            <CardContent className="flex flex-col gap-4">
              <div>
                <h1 className="text-base font-medium">{dict.auth.title}</h1>
                <p className="text-sm text-muted-foreground">
                  {dict.auth.ssoHint}
                </p>
              </div>
              <ButtonLink
                href={`/auth/sso/start${next ? `?next=${encodeURIComponent(next)}` : ""}`}
              >
                <LogIn />
                {dict.auth.continueWithKrafta}
              </ButtonLink>
            </CardContent>
          </Card>
        ) : (
          <SignInForm locale={locale} dict={dict} next={next} />
        )}
      </div>
    </div>
  )
}
