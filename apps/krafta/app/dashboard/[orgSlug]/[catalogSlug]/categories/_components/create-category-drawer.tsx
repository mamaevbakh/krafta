"use client"

import { Plus, XIcon } from "lucide-react"
import { useState } from "react"

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from "@/components/ai-elements/conversation"
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"

export function CreateCategoryDrawer() {
  const [aiOpen, setAiOpen] = useState(false)

  return (
    <Drawer direction="right">
      <DrawerTrigger asChild>
        <Button>
          <Plus className="size-4 lg:size-5" />
          Create category
        </Button>
      </DrawerTrigger>
      <DrawerContent
        className={cn(
          "flex h-full flex-col px-0 data-[vaul-drawer-direction=right]:!max-w-none",
          aiOpen
            ? "data-[vaul-drawer-direction=right]:!w-screen md:data-[vaul-drawer-direction=right]:!w-[65vw]"
            : "data-[vaul-drawer-direction=right]:!w-screen md:data-[vaul-drawer-direction=right]:!w-[35vw]"
        )}
      >
        <DrawerHeader className="border-b px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <DrawerTitle className="text-lg">
                Create category
              </DrawerTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setAiOpen((open) => !open)}>
                {aiOpen ? "Close assistant" : "Krafta AI"}
              </Button>
              <DrawerClose asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close drawer"
                >
                  <XIcon className="size-4" />
                </Button>
              </DrawerClose>
            </div>
          </div>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="flex-1 px-6 py-6 text-sm text-muted-foreground">
            Category creation form/content
          </div>
          {aiOpen ? (
            
              <div className="flex h-full flex-col border-l">
                <div className="border-b px-4 py-3 text-sm font-medium">
                  Krafta AI
                </div>
                <Conversation className="flex-1">
                  <ConversationContent>
                    <ConversationEmptyState
                      title="Start with a prompt"
                      description="Describe the category and Krafta AI will help."
                    />
                  </ConversationContent>
                </Conversation>
                <div className="border-t bg-background/70 p-3">
                  <PromptInput
                    className="w-full"
                    onSubmit={(message, event) => {
                      event.preventDefault()
                      event.currentTarget.reset()
                    }}
                  >
                    <PromptInputBody>
                      <PromptInputTextarea />
                      <PromptInputFooter>
                        <PromptInputTools>
                        </PromptInputTools>
                        <PromptInputSubmit />
                      </PromptInputFooter>
                    </PromptInputBody>
                  </PromptInput>
                </div>
              </div>
            
          ) : null}
        </div>
        <DrawerFooter className="border-t px-6 py-4">
          <div className="flex w-full gap-3 lg:justify-end">
            <DrawerClose asChild>
              <Button
                variant="outline"
                size="lg"
                className="flex-1 lg:flex-none"
              >
                Cancel
              </Button>
            </DrawerClose>
            <Button size="lg" className="flex-1 lg:flex-none">
              Create category
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
