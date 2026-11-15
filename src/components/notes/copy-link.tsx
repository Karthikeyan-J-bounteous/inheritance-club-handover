"use client";

import { useState, useSyncExternalStore } from "react";
import { CopyIcon, ExternalLinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

const noop = () => () => {};

/** The signed link, in full, with Copy and Open. The origin is the one the lead is using. */
export function CopyLink({ path, who }: { path: string; who: string }) {
  // The page's own origin, known only in the browser; the server renders the path alone.
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => "");
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  const url = `${origin}${path}`;
  return (
    <div className="flex flex-col gap-2" data-testid="note-link">
      <label className="text-sm font-medium" htmlFor="note-link-input">
        The link to send {who}
      </label>
      <input id="note-link-input" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="h-10 w-full rounded-lg border bg-muted/40 px-3 font-mono text-xs" />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied("yes");
            } catch {
              setCopied("no");
            }
          }}
        >
          <CopyIcon aria-hidden="true" />
          Copy the link
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href={path} target="_blank" rel="noopener noreferrer">
            <ExternalLinkIcon aria-hidden="true" />
            Open it as {who} would
          </a>
        </Button>
        <span role="status" className="text-xs text-muted-foreground">
          {copied === "yes" ? "Copied." : copied === "no" ? "Could not copy: select the link and copy it yourself." : ""}
        </span>
      </div>
    </div>
  );
}
