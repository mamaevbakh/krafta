"use client";

import { useEveAgent } from "eve/react";
import { FilePen, Sparkles, Terminal } from "lucide-react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Suggestion } from "@/components/ai-elements/suggestion";
import { Loader } from "@/components/ai-elements/loader";

// The Krafta Studio CODEGEN agent — the v0/Lovable-for-commerce engine. Talks to
// the eve agent (studio-agent/) mounted same-origin via withEve, so there's no
// host/URL to configure. It edits a real Krafta shop project in a sandbox; the
// commerce stays on Krafta's engine via @krafta/commerce.
const SUGGESTIONS = [
  "Make the shop dark and minimal",
  "Add a hero with a bold headline",
  "Use larger product cards",
  "Add an About page",
];

// Map eve's built-in sandbox tools to a friendly activity label.
function toolLabel(name: string): { label: string; icon: typeof FilePen } | null {
  if (name === "write_file") return { label: "Edited a file", icon: FilePen };
  if (name === "read_file" || name === "glob" || name === "grep")
    return { label: "Read your shop", icon: FilePen };
  if (name === "bash") return { label: "Ran a command", icon: Terminal };
  return null;
}

// Where the sandbox shop fetches commerce from. The sandbox is isolated, so this
// must be the PUBLIC Krafta API, not a localhost dev server.
const COMMERCE_API_URL =
  process.env.NEXT_PUBLIC_KRAFTA_API_URL ?? "https://www.krafta.org";

export function StudioCodegenPanel({
  shopName,
  catalogId,
  publishableKey,
}: {
  shopName: string;
  catalogId?: string;
  publishableKey?: string | null;
}) {
  // Tell the agent which shop it's building for. clientContext rides every turn
  // (per eve's prepareSend) as ephemeral context — the agent writes the sandbox's
  // .env.local from it (NEXT_PUBLIC_KRAFTA_API_URL + NEXT_PUBLIC_KRAFTA_PUBLISHABLE_KEY)
  // so the generated shop renders THIS catalog's data through @krafta/commerce.
  const agent = useEveAgent({
    prepareSend: (input) => ({
      ...input,
      clientContext: {
        shopName,
        catalogId: catalogId ?? null,
        commerceApiUrl: COMMERCE_API_URL,
        publishableKey: publishableKey ?? null,
      },
    }),
  });
  const busy = agent.status === "submitted" || agent.status === "streaming";
  const messages = agent.data.messages;
  const isEmpty = messages.length === 0;

  const send = (text: string) => {
    const value = text.trim();
    if (!value || busy) return;
    void agent.send({ message: value });
  };

  const handleSubmit = (message: PromptInputMessage) => {
    send(message.text ?? "");
  };

  return (
    <section className="flex h-[72vh] min-h-[560px] w-full flex-col overflow-hidden rounded-xl border border-border bg-background">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-md border border-border bg-muted/40">
            <Sparkles className="size-4" aria-hidden />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium">Krafta Studio</h2>
              <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Beta
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Build {shopName} by describing it — the AI writes the code
            </p>
          </div>
        </div>
      </header>

      <Conversation className="flex-1">
        <ConversationContent>
          {isEmpty ? (
            <div className="m-auto flex max-w-md flex-col items-center gap-4 px-4 py-10 text-center">
              <span className="flex size-11 items-center justify-center rounded-full border border-border bg-muted/40">
                <Sparkles className="size-5 text-muted-foreground" aria-hidden />
              </span>
              <div className="space-y-1">
                <h3 className="text-base font-medium">Describe your shop</h3>
                <p className="text-sm text-muted-foreground">
                  Tell me how it should look and what pages it needs. I build it
                  in real code on Krafta&apos;s commerce engine.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <Suggestion
                    key={suggestion}
                    suggestion={suggestion}
                    onClick={send}
                  />
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => {
              const parts = (message.parts ?? []) as unknown as Array<
                Record<string, unknown>
              >;
              const text = parts
                .filter((part) => part.type === "text")
                .map((part) => String(part.text ?? ""))
                .join("");
              const tools = parts
                .filter(
                  (part) =>
                    typeof part.type === "string" &&
                    (part.type as string).includes("tool"),
                )
                .map((part) =>
                  toolLabel(String(part.toolName ?? part.type ?? "")),
                )
                .filter((entry): entry is NonNullable<typeof entry> => !!entry);

              return (
                <Message from={message.role} key={message.id}>
                  {message.role === "assistant" && tools.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {tools.map((tool, index) => {
                        const Icon = tool.icon;
                        return (
                          <span
                            key={`${message.id}-tool-${index}`}
                            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground"
                          >
                            <Icon className="size-3" aria-hidden />
                            {tool.label}
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                  {text ? (
                    <MessageContent>
                      {message.role === "assistant" ? (
                        <MessageResponse>{text}</MessageResponse>
                      ) : (
                        text
                      )}
                    </MessageContent>
                  ) : null}
                </Message>
              );
            })
          )}

          {agent.status === "submitted" ? (
            <Message from="assistant">
              <MessageContent>
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader size={14} /> Working on your shop…
                </span>
              </MessageContent>
            </Message>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t border-border p-3">
        {agent.error ? (
          <p className="mb-2 px-1 text-xs text-destructive">
            Something went wrong. Please try again.
          </p>
        ) : null}
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea placeholder="Describe a change to your shop…" />
          </PromptInputBody>
          <PromptInputFooter>
            <span className="px-1 text-xs text-muted-foreground">
              Beta · the AI edits real code. Live preview is coming.
            </span>
            <PromptInputSubmit status={agent.status} disabled={busy} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </section>
  );
}
