"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { createClient } from "@/lib/supabase/client"
import type { Dict, Locale } from "@/lib/i18n"

export function SignInForm({
  locale,
  dict,
  next,
}: {
  locale: Locale
  dict: Dict
  next?: string
}) {
  const router = useRouter()
  const [mode, setMode] = React.useState<"signIn" | "signUp">("signIn")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)

    const supabase = createClient()
    const { error: authError } =
      mode === "signIn"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })

    if (authError) {
      // Supabase's message is in English and leaks whether the address exists.
      // Show one catalogue string for every failure instead: it stays in the
      // visitor's language and does not confirm which emails have accounts.
      setError(dict.auth.failed)
      setPending(false)
      return
    }

    // Full reload rather than a client push — the session cookie is set by the
    // auth call and `proxy.ts` has to see it before the console renders.
    const destination = next && next.startsWith("/") ? next : `/${locale}`
    router.replace(destination)
    router.refresh()
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <h1 className="text-base font-medium">{dict.auth.title}</h1>
            <p className="text-sm text-muted-foreground">{dict.auth.subtitle}</p>
          </div>

          <Field>
            <FieldLabel htmlFor="email">{dict.auth.email}</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="password">{dict.auth.password}</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete={
                mode === "signIn" ? "current-password" : "new-password"
              }
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={pending}>
            {pending ? <Spinner /> : null}
            {mode === "signIn" ? dict.auth.signIn : dict.auth.signUp}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setMode(mode === "signIn" ? "signUp" : "signIn")
              setError(null)
            }}
          >
            {mode === "signIn" ? dict.auth.toSignUp : dict.auth.toSignIn}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
