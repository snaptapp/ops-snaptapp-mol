/** Content administration route: facts, topics, playlists, and crawl intake.
 * Section components live in src/admin/; this file keeps the route, the
 * ContentPage shell, CSV export, and the replacement commit notice. */
import { Fragment, useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button, Card, CardLabel } from "@/index";
import { ErrorNote, FactStatusBadge, InfoTip, InlineEditorRow, PageHead } from "@/admin/AdminShell";
import { CrawlQueue, PlaylistsPanel, TopicsPanel } from "@/admin/taxonomyPanels";
import { FactsBankChat } from "@/admin/FactsBankChat";
import { exportFactsData, fetchBankObservability, fetchFacts } from "@/lib/admin/content.functions";
import { fetchPlaylists, fetchSubjects } from "@/lib/admin/ops.functions";
import { CONTENT_VIEWS, GENRES, isContentView, matchScopesForGenre } from "@/lib/admin/taxonomy";
import { FACT_STATUSES } from "../../../shared/fact-lifecycle-contract.gen";
import { STATUS } from "@/lib/admin/contract";
import type { ContentView } from "@/lib/admin/taxonomy";
import { BankObservabilityPanel } from "@/admin/BankObservabilityPanel";
import { FactEditor } from "@/admin/FactEditor";
import { NewFactForm } from "@/admin/NewFactForm";
import { ImportCsvModal } from "@/admin/ImportCsvModal";
import { PendingAdmissionNotice } from "@/admin/PendingAdmissionNotice";
import { type CorrectedReplacementResult, type Fact } from "@/admin/fact-bits";

export { BankObservabilityPanel } from "@/admin/BankObservabilityPanel";
export { CorrectedReplacementForm } from "@/admin/CorrectedReplacementForm";
export { FactEditor } from "@/admin/FactEditor";
export { ImportCsvModal } from "@/admin/ImportCsvModal";
export { NewFactForm } from "@/admin/NewFactForm";
export { PENDING_ADMISSION_COPY, PENDING_PROMOTION_COPY } from "@/admin/fact-bits";
export type { CorrectedReplacementResult } from "@/admin/fact-bits";


export const Route = createFileRoute("/admin/facts")({
  validateSearch: (search: Record<string, unknown>): { view?: ContentView } => {
    if (isContentView(search.view)) return { view: search.view };
    return {};
  },
  head: () => ({
    meta: [
      { title: "Content — More or Less Admin" },
      { name: "description", content: "Facts, topics, playlists, and crawl intake." },
      { property: "og:title", content: "Content — More or Less Admin" },
      { property: "og:description", content: "Facts, topics, playlists, and crawl intake." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContentPage,
});
function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function ReplacementCommitNotice({
  result,
  onDismiss,
}: {
  result: CorrectedReplacementResult;
  onDismiss: () => void;
}) {
  return (
    <Card>
      <div
        role="status"
        aria-live="polite"
        aria-label="Corrected replacement committed"
        style={{
          display: "grid",
          gap: "var(--ds-arena-space-2)",
          color: "var(--ds-arena-color-text-muted)",
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        <div className="admin-page-head">
          <strong style={{ color: "var(--ds-arena-color-text)" }}>Corrected replacement committed</strong>
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
        <div>
          Original <code>{result.original.id}</code> is <FactStatusBadge status={result.original.status} />;
          replacement <code>{result.replacement.id}</code> is <FactStatusBadge status={result.replacement.status} />.
        </div>
        <p style={{ margin: 0 }}>
          The original is retired. The replacement is pending Foundry admission, not active; only the nightly
          Foundry audit can promote it after review.
        </p>
      </div>
    </Card>
  );
}

/**
 * Manages the content administration interface for facts, topics, playlists, and crawl intake.
 */
function ContentPage() {
  const { view: viewParam } = Route.useSearch();
  const view: ContentView = viewParam ?? "facts";
  const list = useServerFn(fetchFacts);
  const exportFn = useServerFn(exportFactsData);
  const getBankObservability = useServerFn(fetchBankObservability);
  const getSubjects = useServerFn(fetchSubjects);
  const getPlaylists = useServerFn(fetchPlaylists);
  const [filters, setFilters] = useState({
    search: "",
    category: "",
    family: "",
    playlistId: "",
    subject: "",
    angle: "",
    // Default to the contract's active status; `String(...)` keeps the state
    // field's inferred type `string` (the filter also accepts "" for "All").
    status: String(STATUS.active),
    contentRating: "",
    surpriseFactor: "",
  });
  const [sort, setSort] = useState<{
    field: "subject" | "angle" | "true_number" | "surprise_factor" | "served_count";
    order: "asc" | "desc";
  }>({
    field: "subject",
    order: "asc",
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selected, setSelected] = useState<Fact | null>(null);
  const [replacementCommit, setReplacementCommit] = useState<CorrectedReplacementResult | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const query = useQuery({
    queryKey: ["facts", filters, sort, page, pageSize],
    queryFn: () =>
      list({
        data: {
          search: filters.search || undefined,
          category: filters.category || undefined,
          family: filters.family || undefined,
          playlistId: filters.playlistId || undefined,
          subject: filters.subject || undefined,
          angle: filters.angle || undefined,
          status: filters.status || undefined,
          contentRating: filters.contentRating || undefined,
          surpriseFactor: filters.surpriseFactor !== "" ? Number(filters.surpriseFactor) : undefined,
          sortField: sort.field,
          sortOrder: sort.order,
          page,
          pageSize,
        },
      }),
    enabled: view === "facts",
    retry: false,
  });

  const bankObservabilityQuery = useQuery({
    queryKey: ["fact_bank_observability"],
    queryFn: () => getBankObservability(),
    enabled: view === "facts",
    staleTime: 30_000,
    retry: false,
  });

  const subjectsQuery = useQuery({
    queryKey: ["subjects", "content-join"],
    queryFn: () => getSubjects({ data: {} }),
    staleTime: 60_000,
    retry: false,
  });

  const playlistsQuery = useQuery({
    queryKey: ["playlists"],
    queryFn: () => getPlaylists(),
    staleTime: 60_000,
    retry: false,
  });

  const subjects = subjectsQuery.data?.subjects;
  const subjectsByName = useMemo(() => {
    const map = new Map<string, NonNullable<typeof subjects>[number]>();
    for (const subject of subjects ?? []) {
      map.set(subject.subject.toLowerCase(), subject);
      for (const alias of subject.aliases) map.set(alias.toLowerCase(), subject);
    }
    return map;
  }, [subjects]);

  const matchScopeOptions = matchScopesForGenre(
    filters.category,
    (subjectsQuery.data?.subjects ?? [])
      .filter((s) => !filters.category || s.category === filters.category)
      .map((s) => s.sub_category),
  );

  const toggleSort = (field: typeof sort.field) => {
    setPage(1);
    if (sort.field === field) {
      setSort({ field, order: sort.order === "asc" ? "desc" : "asc" });
    } else {
      setSort({ field, order: "asc" });
    }
  };

  const renderSortIcon = (field: typeof sort.field) => {
    if (sort.field !== field) return <span style={{ opacity: 0.35, marginLeft: 4, fontSize: 10 }}>↕</span>;
    return (
      <span style={{ color: "var(--ds-arena-color-lime)", marginLeft: 4, fontSize: 11 }}>
        {sort.order === "asc" ? "▲" : "▼"}
      </span>
    );
  };

  const hasActiveFilters = Boolean(
    filters.search ||
    filters.category ||
    filters.family ||
    filters.playlistId ||
    filters.subject ||
    filters.angle ||
    filters.status !== STATUS.active ||
    filters.contentRating ||
    filters.surpriseFactor !== "",
  );

  const resetFilters = () => {
    setPage(1);
    setFilters({
      search: "",
      category: "",
      family: "",
      playlistId: "",
      subject: "",
      angle: "",
      status: STATUS.active,
      contentRating: "",
      surpriseFactor: "",
    });
  };

  const handleExportCsv = async () => {
    try {
      setExporting(true);
      const facts = await exportFn({
        data: {
          search: filters.search || undefined,
          category: filters.category || undefined,
          family: filters.family || undefined,
          playlistId: filters.playlistId || undefined,
          subject: filters.subject || undefined,
          angle: filters.angle || undefined,
          // Exports are the active bank snapshot. Pending admission rows stay
          // visible in the editor/list but never enter the active export set.
          status: STATUS.active,
          contentRating: filters.contentRating || undefined,
          surpriseFactor: filters.surpriseFactor !== "" ? Number(filters.surpriseFactor) : undefined,
          sortField: sort.field,
          sortOrder: sort.order,
        },
      });
      const headers = [
        "id",
        "subject",
        "angle",
        "true_number",
        "unit",
        "question",
        "context",
        "surprise_factor",
        "content_rating",
        "status",
        "source_urls",
      ];
      const rows = facts.map((f) => [
        escapeCsv(f.id),
        escapeCsv(f.subject),
        escapeCsv(f.angle),
        escapeCsv(f.true_number),
        escapeCsv(f.unit),
        escapeCsv(f.question || f.claim_template),
        escapeCsv(f.context),
        escapeCsv(f.surprise_factor),
        escapeCsv(f.content_rating),
        escapeCsv(f.status),
        escapeCsv((f.source_urls || []).join(" ; ")),
      ]);
      const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `fact_bank_export_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const totalPages = useMemo(
    () => (query.data ? Math.max(1, Math.ceil(query.data.total / query.data.pageSize)) : 1),
    [query.data],
  );

  const viewLabel = (item: ContentView) => {
    switch (item) {
      case "facts":
        return "Facts";
      case "topics":
        return "Topics";
      case "playlists":
        return "Playlists";
      case "crawl":
        return "Crawl";
      default: {
        const _never: never = item;
        return _never;
      }
    }
  };

  return (
    <div className="daily-blitz-layout">
      <div className="daily-blitz-main">
        <PageHead
          title="Content"
          description="Facts attach to topics. Topics sit in a genre; match scope is resolver metadata. Playlists are optional theme mixes."
          actions={
            view === "facts" ? (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <Button
                  variant="ghost"
                  disabled={exporting}
                  onClick={() => void handleExportCsv()}
                >
                  {exporting ? "Exporting…" : "Export CSV (active only)"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setImporting((v) => !v);
                    setCreating(false);
                    setSelected(null);
                  }}
                >
                  {importing ? "Close Import" : "Import CSV"}
                </Button>
                <Button
                  onClick={() => {
                    setCreating((value) => !value);
                    setImporting(false);
                    setSelected(null);
                  }}
                >
                  {creating ? "Close" : "New fact"}
                </Button>
              </div>
            ) : undefined
          }
        />

        <nav className="admin-tabs" aria-label="Content sections">
          {CONTENT_VIEWS.map((item) => (
            <Link
              key={item}
              to="/admin/facts"
              search={{ view: item }}
              className={view === item ? "is-active" : undefined}
            >
              {viewLabel(item)}
            </Link>
          ))}
        </nav>

        {view === "topics" ? <TopicsPanel /> : null}
        {view === "playlists" ? <PlaylistsPanel /> : null}
        {view === "crawl" ? <CrawlQueue /> : null}
        {view === "facts" ? (
          <>

            <div className="admin-toolbar">
              <label className="admin-field" style={{ flex: "1 1 240px" }}>
                <span>Search all text (subject, angle, question, context)</span>
                <input
                  className="admin-input"
                  placeholder="Search keywords…"
                  value={filters.search}
                  onChange={(e) => {
                    setPage(1);
                    setFilters({ ...filters, search: e.target.value });
                  }}
                />
              </label>
              <label className="admin-field" style={{ flex: "0 1 200px" }}>
                <span>Genre</span>
                <select
                  className="admin-select"
                  value={filters.category}
                  onChange={(e) => {
                    setPage(1);
                    setFilters({ ...filters, category: e.target.value, family: "" });
                  }}
                >
                  <option value="">All genres</option>
                  {GENRES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-field" style={{ flex: "0 1 180px" }}>
                <span>Match Scope</span>
                <select
                  className="admin-select"
                  value={filters.family}
                  onChange={(e) => {
                    setPage(1);
                    setFilters({ ...filters, family: e.target.value });
                  }}
                >
                  <option value="">All match scopes</option>
                  {matchScopeOptions.map((scope) => (
                    <option key={scope} value={scope}>
                      {scope}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-field" style={{ flex: "0 1 180px" }}>
                <span>Playlist</span>
                <select
                  className="admin-select"
                  value={filters.playlistId}
                  onChange={(e) => {
                    setPage(1);
                    setFilters({ ...filters, playlistId: e.target.value });
                  }}
                >
                  <option value="">All playlists</option>
                  {(playlistsQuery.data ?? []).map((playlist) => (
                    <option key={playlist.id} value={playlist.id}>
                      {playlist.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-field">
                <span>Per page</span>
                <select
                  className="admin-select"
                  value={pageSize}
                  onChange={(e) => {
                    setPage(1);
                    setPageSize(Number(e.target.value));
                  }}
                >
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="250">250</option>
                  <option value="500">500</option>
                  <option value="1000">All (1,000)</option>
                </select>
              </label>
              {hasActiveFilters ? (
                <div style={{ alignSelf: "flex-end", paddingBottom: "6px" }}>
                  <Button size="sm" variant="ghost" onClick={resetFilters}>
                    Reset filters
                  </Button>
                </div>
              ) : null}
            </div>

            <BankObservabilityPanel
              data={bankObservabilityQuery.data}
              isLoading={bankObservabilityQuery.isLoading}
              error={bankObservabilityQuery.error}
            />

            <PendingAdmissionNotice />

            {replacementCommit ? (
              <ReplacementCommitNotice
                result={replacementCommit}
                onDismiss={() => setReplacementCommit(null)}
              />
            ) : null}

            <ErrorNote error={query.error} />
            {importing ? <ImportCsvModal onDone={() => setImporting(false)} /> : null}
            {creating ? <NewFactForm onDone={() => setCreating(false)} /> : null}

            <div className="admin-mobile-fact-controls">
              <label className="admin-field">
                <span>Topic</span>
                <input className="admin-input" value={filters.subject} onChange={(event) => { setPage(1); setFilters({ ...filters, subject: event.target.value }); }} placeholder="Filter topic…" />
              </label>
              <label className="admin-field">
                <span>Angle</span>
                <input className="admin-input" value={filters.angle} onChange={(event) => { setPage(1); setFilters({ ...filters, angle: event.target.value }); }} placeholder="Filter angle…" />
              </label>
              <label className="admin-field">
                <span>Status</span>
                <select className="admin-select" value={filters.status} onChange={(event) => { setPage(1); setFilters({ ...filters, status: event.target.value }); }}>
                  <option value="">All</option>
                  {FACT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <label className="admin-field">
                <span>Rating</span>
                <select className="admin-select" value={filters.contentRating} onChange={(event) => { setPage(1); setFilters({ ...filters, contentRating: event.target.value }); }}>
                  <option value="">All</option><option value="standard">standard</option><option value="after_dark">after_dark</option>
                </select>
              </label>
              <label className="admin-field">
                <span>Surprise</span>
                <select className="admin-select" value={filters.surpriseFactor} onChange={(event) => { setPage(1); setFilters({ ...filters, surpriseFactor: event.target.value }); }}>
                  <option value="">All</option><option value="0">0 · Obvious</option><option value="1">1 · Mild</option><option value="2">2 · Very</option><option value="3">3 · Mind-blowing</option>
                </select>
              </label>
              <label className="admin-field">
                <span>Sort by</span>
                <select className="admin-select" value={sort.field} onChange={(event) => toggleSort(event.target.value as typeof sort.field)}>
                  <option value="subject">Topic</option><option value="angle">Angle</option><option value="true_number">Value</option><option value="surprise_factor">Surprise</option><option value="served_count">Served</option>
                </select>
              </label>
              <Button size="sm" variant="ghost" onClick={() => { setPage(1); setSort({ ...sort, order: sort.order === "asc" ? "desc" : "asc" }); }}>
                {sort.order === "asc" ? "Ascending ↑" : "Descending ↓"}
              </Button>
              {hasActiveFilters ? <Button size="sm" variant="ghost" onClick={resetFilters}>Reset filters</Button> : null}
            </div>

            <div className="admin-table-wrap">
              <table className="admin-table admin-card-table admin-card-table--facts">
                <thead>
                  <tr>
                    <th className="admin-th-sortable" onClick={() => toggleSort("subject")}>
                      Topic {renderSortIcon("subject")}
                    </th>
                    <th className="admin-th-sortable" onClick={() => toggleSort("angle")}>
                      Angle {renderSortIcon("angle")}{" "}
                      <InfoTip position="bottom" text="The specific metric, dimension, or record being measured." />
                    </th>
                    <th className="admin-th-sortable" onClick={() => toggleSort("true_number")}>
                      Value {renderSortIcon("true_number")}
                    </th>
                    <th className="admin-th-sortable" onClick={() => toggleSort("surprise_factor")}>
                      Surprise {renderSortIcon("surprise_factor")}{" "}
                      <InfoTip position="bottom" text="Scale of 0 (obvious) to 3 (mind-blowing counterintuitive)." />
                    </th>
                    <th>Rating</th>
                    <th>Status</th>
                    <th className="admin-th-sortable" onClick={() => toggleSort("served_count")}>
                      Served {renderSortIcon("served_count")}
                    </th>
                    <th style={{ width: 80, textAlign: "right" }} />
                  </tr>
                  <tr className="admin-table-header-filters">
                    <th>
                      <input
                        className="admin-header-input"
                        placeholder="Filter topic…"
                        value={filters.subject}
                        onChange={(e) => {
                          setPage(1);
                          setFilters({ ...filters, subject: e.target.value });
                        }}
                      />
                    </th>
                    <th>
                      <input
                        className="admin-header-input"
                        placeholder="Filter angle…"
                        value={filters.angle}
                        onChange={(e) => {
                          setPage(1);
                          setFilters({ ...filters, angle: e.target.value });
                        }}
                      />
                    </th>
                    <th />
                    <th>
                      <select
                        className="admin-header-select"
                        value={filters.surpriseFactor}
                        onChange={(e) => {
                          setPage(1);
                          setFilters({ ...filters, surpriseFactor: e.target.value });
                        }}
                      >
                        <option value="">All</option>
                        <option value="0">0 · Obvious</option>
                        <option value="1">1 · Mild</option>
                        <option value="2">2 · Very</option>
                        <option value="3">3 · Mind-blowing</option>
                      </select>
                    </th>
                    <th>
                      <select
                        className="admin-header-select"
                        value={filters.contentRating}
                        onChange={(e) => {
                          setPage(1);
                          setFilters({ ...filters, contentRating: e.target.value });
                        }}
                      >
                        <option value="">All</option>
                        <option value="standard">standard</option>
                        <option value="after_dark">after_dark</option>
                      </select>
                    </th>
                    <th>
                      <select
                        className="admin-header-select"
                        value={filters.status}
                        onChange={(e) => {
                          setPage(1);
                          setFilters({ ...filters, status: e.target.value });
                        }}
                      >
                        {/* Exactly the statuses the shared contract declares,
                            in declaration order, plus the unfiltered "All"
                            (Requirement 9.2). */}
                        <option value="">All</option>
                        {FACT_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </th>
                    <th />
                    <th>
                      {hasActiveFilters ? (
                        <button
                          type="button"
                          className="admin-clear-filter-btn"
                          onClick={resetFilters}
                          title="Reset all filters"
                        >
                          Reset
                        </button>
                      ) : null}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {query.data?.facts.map((fact) => {
                    const isEditing = selected?.id === fact.id;
                    return (
                      <Fragment key={fact.id}>
                        <tr className={isEditing ? "is-editing" : undefined}>
                          <td>
                            <strong>{fact.subject}</strong>
                            {(() => {
                              const topic = subjectsByName.get(fact.subject.toLowerCase());
                              if (!topic) return null;
                              const playlistNames = topic.playlist_ids
                                .map((id) => (playlistsQuery.data ?? []).find((p) => p.id === id)?.name)
                                .filter(Boolean);
                              return (
                                <span className="admin-topic-meta">
                                  {[topic.category, topic.sub_category].filter(Boolean).join(" › ") || "No match scope"}
                                  {playlistNames.length ? ` · ${playlistNames.join(", ")}` : ""}
                                </span>
                              );
                            })()}
                          </td>
                          <td>{fact.angle}</td>
                          <td>
                            {fact.true_number ?? "—"} {fact.unit}
                            {fact.previous_true_number !== null ? (
                              <div style={{ fontSize: 12, color: "var(--ds-arena-color-amber)" }}>
                                was {fact.previous_true_number}
                              </div>
                            ) : null}
                          </td>
                          <td>
                            {fact.surprise_factor !== null && fact.surprise_factor !== undefined ? (
                              <span
                                title={
                                  fact.surprise_factor >= 3
                                    ? "3 · Mind-blowing (Intuition trap)"
                                    : fact.surprise_factor === 2
                                      ? "2 · Very surprising"
                                      : fact.surprise_factor === 1
                                        ? "1 · Mildly surprising"
                                        : "0 · Obvious"
                                }
                              >
                                {fact.surprise_factor}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>{fact.content_rating}</td>
                          <td>
                            <FactStatusBadge status={fact.status} />
                            {fact.status === STATUS.pending ? (
                              <span className="admin-topic-meta">Foundry audit only</span>
                            ) : null}
                          </td>
                          <td>{fact.served_count}</td>
                          <td>
                            <Button
                              size="sm"
                              variant={isEditing ? "primary" : "ghost"}
                              onClick={() => {
                                setCreating(false);
                                setImporting(false);
                                setSelected(isEditing ? null : fact);
                              }}
                            >
                              {isEditing ? "Close" : "Edit"}
                            </Button>
                          </td>
                        </tr>
                        {isEditing ? (
                          <InlineEditorRow colSpan={8}>
                            <FactEditor
                              fact={fact}
                              onDone={() => setSelected(null)}
                              onReplacementCommitted={(result) => {
                                setReplacementCommit(result);
                                setSelected(null);
                              }}
                            />
                          </InlineEditorRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {query.isLoading ? <p className="admin-empty">Loading facts…</p> : null}
              {query.data && query.data.facts.length === 0 ? (
                <p className="admin-empty">No facts match these filters.</p>
              ) : null}
            </div>

            <div className="admin-toolbar">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <CardLabel>
                Page {page} of {totalPages} · {query.data?.total ?? 0} matches
              </CardLabel>
              <Button
                size="sm"
                variant="ghost"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
            {query.data?.windowed ? (
              <p style={{ color: "var(--ds-arena-color-text-muted)", fontSize: 13 }}>
                Result scan limit reached. Narrow the filters for full coverage.
              </p>
            ) : null}
          </>
        ) : null}
      </div>
      <aside className="daily-blitz-chat">
        <FactsBankChat />
      </aside>
    </div>
  );
}

