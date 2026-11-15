import { Suspense } from "react";
import type { Metadata } from "next";
import { Commitments } from "@/components/ledger/commitments";
import { TrustLegend } from "@/components/ledger/trust-legend";
import { PipelinePanel } from "@/components/ledger/pipeline-panel";
import { Recurring } from "@/components/ledger/recurring";
import { WorkingLedgerNotice } from "@/components/ledger/working-ledger-notice";
import { LoadingBlock } from "@/components/feedback/loading-block";
import { ErrorState } from "@/components/feedback/error-state";
import { SignInPrompt } from "@/components/feedback/sign-in-prompt";
import { NextStepBar } from "@/components/next-step-bar";
import { PageHeader } from "@/components/page-header";
import { TabNav } from "@/components/tab-nav";
import { getViewer } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Build the ledger · Inheritance" };

// Step 2 only. Conflicts and gaps are step 3 (/check); every message is /messages.
const TABS = [
  { key: "commitments", label: "Promises", hint: "Things the committee promised to people" },
  { key: "recurring", label: "Yearly duties", hint: "Duties that come round every cycle, with their approvals, and ones found because they repeat" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A build this person started and left in the last half hour (a refresh, or the tab closed): the panel carries on with it. */
async function unfinishedRun(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, workspaceId: string, userId: string): Promise<string | null> {
  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data } = await supabase.from("jobs").select("payload").eq("workspace_id", workspaceId).in("status", ["queued", "running"])
    .eq("payload->>requested_by", userId).gte("created_at", since).order("created_at", { ascending: false }).limit(1);
  return (data?.[0]?.payload as { run_id?: string } | null)?.run_id ?? null;
}

async function LedgerContent({ searchParams }: { searchParams: PageProps<"/ledger">["searchParams"] }) {
  let viewer;
  try {
    viewer = await getViewer();
  } catch {
    return <ErrorState title="Could not reach the database" />;
  }
  if (!viewer) return <SignInPrompt what="see the ledger" />;
  if (!viewer.membership) return <p>Your account is not a member of a workspace.</p>;
  const sp = await searchParams;
  const tab: TabKey = sp.tab === "recurring" ? "recurring" : "commitments";
  const { role, workspaceId } = viewer.membership;
  if (role === "incoming_lead" || role === "member") return <WorkingLedgerNotice />;

  // What has been built so far, as this role may read it: for the build panel and the next step.
  const supabase = await createSupabaseServerClient();
  const { data: kinds } = await supabase.from("obligations").select("kind").eq("workspace_id", workspaceId);
  const promises = (kinds ?? []).filter((k) => k.kind === "commitment").length;
  const duties = (kinds ?? []).length - promises;
  const canRun = role === "outgoing_lead" || role === "advisor";
  const resumeRunId = canRun ? await unfinishedRun(supabase, workspaceId, viewer.userId) : null;
  return (
    <div className="flex flex-col gap-6">
      <PipelinePanel
        canRun={canRun}
        built={{ promises, duties }}
        resumeRunId={resumeRunId}
        provider={process.env.LLM_PROVIDER === "fake" ? "fake" : "anthropic"}
        model={process.env.LLM_MODEL_FAST ?? "not configured"}
      />
      <TabNav label="Ledger sections" basePath="/ledger" tabs={TABS} current={tab} />
      <TrustLegend />
      {tab === "recurring" ? <Recurring workspaceId={workspaceId} /> : <Commitments workspaceId={workspaceId} />}
      {promises + duties > 0 && (
        <NextStepBar label="Next: check the records" href="/check">
          <strong>{plural(promises, "promise")} and {plural(duties, "yearly duty", "yearly duties")} found.</strong> Next, see where the records disagree or say nothing.
        </NextStepBar>
      )}
    </div>
  );
}

export default function LedgerPage(props: PageProps<"/ledger">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <PageHeader
        title="Build the ledger"
        purpose="Read the club's files and list everything the old committee promised or must do each year. Each item shows its quote and what happened next, or “No evidence kept”."
      />
      <Suspense fallback={<LoadingBlock label="Loading the ledger…" variant="list" rows={4} />}>
        <LedgerContent searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
