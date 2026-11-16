"use client";

import { useState } from "react";
import { XIcon } from "lucide-react";

/**
 * The one-time note shown after a demo copy is made (the address ends in ?welcome=copy). Dismissing
 * it also takes the flag off the address, so a refresh does not bring it back.
 */
export function WelcomeBanner({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div role="status" className="rise-in flex items-start justify-between gap-3 rounded-2xl border border-primary/20 bg-accent px-5 py-4 text-sm text-accent-foreground" data-testid="welcome-banner">
      <p>{children}</p>
      <button
        type="button"
        aria-label="Dismiss this message"
        onClick={() => {
          setOpen(false);
          window.history.replaceState(null, "", "/");
        }}
        className="-m-1 shrink-0 rounded-md p-1 outline-none hover:bg-card/60 focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <XIcon aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
