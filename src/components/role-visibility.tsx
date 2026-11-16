import Link from "next/link";
import { ChevronDownIcon } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ACCESS_LABELS, ACCESS_LEVELS, ROLE_LABELS, clearance, levelRank, type AccessLevel } from "@/lib/access";
import { getViewer } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const TABLES = [
  { table: "obligations", label: "Obligations" },
  { table: "evidence", label: "Evidence quotes" },
  { table: "events", label: "Source messages" },
  { table: "sources", label: "Source files" },
  { table: "context_items", label: "Context items" },
  { table: "docket_entries", label: "Conflicts" },
  { table: "sealed_items", label: "Sealed placeholders" },
  { table: "audit_log", label: "Audit log rows" },
] as const;

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-4 text-sm text-muted-foreground">{children}</CardContent>
    </Card>
  );
}

/**
 * What the signed-in role can read. Every number comes from a query made with the
 * user's own session, so it is exactly what Postgres RLS returns for that user.
 */
export async function RoleVisibility() {
  let viewer;
  try {
    viewer = await getViewer();
  } catch {
    return (
      <Notice title="Could not reach the database">
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-destructive">The data service is unavailable right now. Try again in a minute.</p>
      </Notice>
    );
  }

  if (!viewer) return null; // the home page shows its own invitation to signed-out visitors

  if (!viewer.membership) {
    return (
      <Notice title="No workspace yet">
        <p>Your account is not a member of any club workspace. If you deleted your demo club, load a new one from the sign-in page.</p>
      </Notice>
    );
  }

  const { role, workspaceName } = viewer.membership;
  const supabase = await createSupabaseServerClient();
  const counts = await Promise.all(
    TABLES.map(async ({ table, label }) => {
      const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
      return { table, label, count: error ? null : (count ?? 0) };
    }),
  );
  const { data: obligations, error: oErr } = await supabase
    .from("obligations")
    .select("id, description, access_level, kind")
    .order("created_at");

  const max = clearance(role);
  const readable = ACCESS_LEVELS.filter((l) => levelRank(l) <= levelRank(max));

  return (
    <Card className="rise-in py-0">
      {/* Closed by default: it is proof for whoever wants it, not part of the journey. */}
      <details className="group" data-testid="role-visibility">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-6 py-5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          <span className="flex flex-col gap-1">
            <span className="text-base font-semibold">How permissions are enforced</span>
            <span className="text-sm text-muted-foreground">
              What {ROLE_LABELS[role].toLowerCase()} {viewer.name} can read, as the database returns it. Open to see the counts.
            </span>
          </span>
          <ChevronDownIcon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <CardHeader className="pt-2">
          <CardDescription>
            {workspaceName}. Readable levels: {readable.map((l) => ACCESS_LABELS[l]).join(", ")}
            {role === "outgoing_lead" && ", plus private items built only from files you uploaded"}
            {role !== "advisor" && ", plus anything explicitly released to your role"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 pb-6 pt-6 md:grid-cols-2">
          <table className="w-full self-start text-sm">
            <caption className="mb-2 text-left font-medium">Rows visible to this role</caption>
            <tbody>
              {counts.map((c) => (
                <tr key={c.table} className="border-b last:border-0">
                  <th scope="row" className="py-1.5 text-left font-normal">{c.label}</th>
                  <td className="py-1.5 text-right font-mono tabular-nums" data-testid={`count-${c.table}`}>
                    {c.count ?? "error"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-sm">
            <h2 className="mb-2 font-medium">Obligations you can read</h2>
            {oErr ? (
              <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-destructive">Could not load obligations. Try again in a moment.</p>
            ) : !obligations?.length ? (
              <EmptyState title="No live ledger rows for this role" body="This list shows the working ledger this role may read, and it is empty for this role right now. Approved items handed over to you are on the Handover page." />
            ) : (
              <ul className="flex flex-col gap-2" data-testid="visible-obligations">
                {obligations.map((o) => (
                  <li key={o.id} className="flex items-start justify-between gap-3">
                    <span>{o.description}</span>
                    <LevelChip level={o.access_level} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap gap-3 md:col-span-2">
            <Button asChild size="sm">
              <Link href="/import">{role === "outgoing_lead" || role === "advisor" ? "Add files" : "See imported files"}</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/messages">See all messages</Link>
            </Button>
          </div>
        </CardContent>
      </details>
    </Card>
  );
}

function LevelChip({ level }: { level: AccessLevel }) {
  return (
    <Badge variant={level === "everyone" ? "outline" : "secondary"} className="shrink-0">
      {ACCESS_LABELS[level]}
    </Badge>
  );
}
