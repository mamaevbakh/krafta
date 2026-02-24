import ReactMarkdown, { type Components } from "react-markdown";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const components: Components = {
  h1: ({ className, ...props }) => (
    <h1
      className={cn("mt-2 scroll-m-20 text-4xl font-semibold tracking-tight", className)}
      {...props}
    />
  ),
  h2: ({ className, ...props }) => (
    <h2
      className={cn(
        "mt-10 scroll-m-20 border-b pb-2 text-2xl font-semibold tracking-tight first:mt-0",
        className,
      )}
      {...props}
    />
  ),
  h3: ({ className, ...props }) => (
    <h3
      className={cn("mt-8 scroll-m-20 text-xl font-semibold tracking-tight", className)}
      {...props}
    />
  ),
  h4: ({ className, ...props }) => (
    <h4 className={cn("mt-6 scroll-m-20 text-lg font-semibold tracking-tight", className)} {...props} />
  ),
  p: ({ className, ...props }) => (
    <p className={cn("leading-7 [&:not(:first-child)]:mt-4", className)} {...props} />
  ),
  ul: ({ className, ...props }) => (
    <ul className={cn("my-4 ml-6 list-disc space-y-2", className)} {...props} />
  ),
  ol: ({ className, ...props }) => (
    <ol className={cn("my-4 ml-6 list-decimal space-y-2", className)} {...props} />
  ),
  li: ({ className, ...props }) => <li className={cn("leading-7", className)} {...props} />,
  hr: ({ className, ...props }) => <hr className={cn("my-8 border-border", className)} {...props} />,
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn(
        "mt-6 rounded-md border-l-4 border-primary/40 bg-muted/30 px-4 py-3 text-sm text-muted-foreground",
        className,
      )}
      {...props}
    />
  ),
  code: ({ className, children, ...props }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code className={cn("font-mono text-sm text-zinc-100", className)} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ className, ...props }) => (
    <pre
      className={cn(
        "my-4 overflow-x-auto rounded-lg border bg-zinc-950 p-4 text-sm text-zinc-100",
        className,
      )}
      {...props}
    />
  ),
  a: ({ className, ...props }) => (
    <a
      className={cn("font-medium text-primary underline underline-offset-4", className)}
      {...props}
    />
  ),
  strong: ({ className, ...props }) => (
    <strong className={cn("font-semibold text-foreground", className)} {...props} />
  ),
  em: ({ className, ...props }) => <em className={cn("italic", className)} {...props} />,
};

function inferTags(markdown: string) {
  const tags: string[] = [];
  if (markdown.includes("payments.logs")) tags.push("logs");
  if (markdown.includes("Uzum")) tags.push("uzum");
  if (markdown.includes("Subscriptions")) tags.push("subscriptions");
  if (markdown.includes("Krafta Pay")) tags.push("krafta-pay");
  return tags;
}

export function MarkdownDoc({
  markdown,
  title,
  description,
}: {
  markdown: string;
  title: string;
  description?: string;
}) {
  const tags = inferTags(markdown);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-background p-6">
        <div className="flex flex-wrap items-center gap-2">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[11px] uppercase tracking-wide">
              {tag}
            </Badge>
          ))}
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>

      <article className="rounded-xl border bg-background p-6 md:p-8">
        <div className="mx-auto max-w-4xl">
          <ReactMarkdown components={components}>{markdown}</ReactMarkdown>
        </div>
      </article>
    </div>
  );
}

