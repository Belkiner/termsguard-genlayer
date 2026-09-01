"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  isConfigured,
  networkName,
  readContract,
  waitForAccepted,
  waitForState,
  watchFinalized,
  writeContract,
  type TxProgress,
} from "../lib/genlayer";
import type { Commitment, Project, Verification } from "../lib/types";

function field(raw: any, index: number, key: string, fallback: any = "") {
  if (Array.isArray(raw)) return raw[index] ?? fallback;
  if (raw && typeof raw === "object") {
    if (raw[key] !== undefined) return raw[key];
    for (const box of [raw.data, raw.result, raw.value]) {
      if (box && typeof box === "object") {
        if (Array.isArray(box)) return box[index] ?? fallback;
        if (box[key] !== undefined) return box[key];
      }
    }
  }
  return fallback;
}

function toProject(raw: any, id: number): Project {
  return {
    id,
    name: String(field(raw, 0, "name", `Project ${id}`)),
    url: String(field(raw, 1, "url", "")),
    category: String(field(raw, 2, "category", "Other")),
    baseline: String(field(raw, 3, "baseline", "")),
    status: String(field(raw, 4, "status", "UNKNOWN")),
    score: Number(field(raw, 5, "score", 0)),
    summary: String(field(raw, 6, "summary", "")),
  };
}

function toCommitment(raw: any, id: number): Commitment {
  return {
    id,
    projectId: Number(field(raw, 0, "project_id", field(raw, 0, "projectId", 0))),
    statement: String(field(raw, 1, "statement", "")),
    deadline: String(field(raw, 2, "deadline", "")),
    status: String(field(raw, 3, "status", "UNKNOWN")),
    score: Number(field(raw, 4, "score", 0)),
    evidence: String(field(raw, 5, "evidence", "")),
  };
}

function toVerification(raw: any, id: number): Verification {
  return {
    id,
    projectId: Number(field(raw, 0, "project_id", field(raw, 0, "projectId", 0))),
    kind: String(field(raw, 1, "kind", "")),
    itemId: Number(field(raw, 2, "item_id", field(raw, 2, "itemId", 0))),
    status: String(field(raw, 3, "status", "UNKNOWN")),
    score: Number(field(raw, 4, "score", 0)),
    summary: String(field(raw, 5, "summary", "")),
    evidence: String(field(raw, 6, "evidence", "")),
  };
}

function badge(status: string) {
  const value = status.toUpperCase();
  if (["FULFILLED", "NO_CHANGE", "BASELINED"].includes(value)) return "good";
  if (["PENDING", "OPEN", "LOW", "PARTIAL"].includes(value)) return "warn";
  if (["BROKEN", "HIGH", "CRITICAL"].includes(value)) return "bad";
  return "muted";
}

const stageLabel: Record<string, string> = {
  PENDING: "Submitting",
  PROPOSING: "Validators proposing",
  COMMITTING: "Validators committing",
  REVEALING: "Validators revealing",
  LEADER_REVEALING: "Leader revealing",
  ACCEPTED: "Consensus accepted",
  READY_TO_FINALIZE: "Ready to finalize",
  FINALIZED: "Finalized",
  UNDETERMINED: "Consensus undetermined",
  CANCELED: "Canceled",
  VALIDATORS_TIMEOUT: "Validators timeout",
  LEADER_TIMEOUT: "Leader timeout",
};

function TxPanel({ tx }: { tx: TxProgress | null }) {
  if (!tx) return null;

  const progress: Record<string, number> = {
    UNINITIALIZED: 5,
    PENDING: 12,
    PROPOSING: 28,
    COMMITTING: 45,
    REVEALING: 62,
    LEADER_REVEALING: 68,
    ACCEPTED: 82,
    READY_TO_FINALIZE: 92,
    FINALIZED: 100,
    CANCELED: 100,
    UNDETERMINED: 70,
    VALIDATORS_TIMEOUT: 100,
    LEADER_TIMEOUT: 100,
  };

  const pct = progress[tx.status] ?? 15;
  const terminalBad =
    !tx.success &&
    ["FINALIZED", "CANCELED", "UNDETERMINED", "VALIDATORS_TIMEOUT", "LEADER_TIMEOUT"].includes(
      tx.status,
    );

  return (
    <div className={`tx-panel ${terminalBad ? "tx-error" : ""}`}>
      <div className="tx-head">
        <div>
          <b>{terminalBad ? "Verification did not complete" : "GenLayer is working"}</b>
          <span>{stageLabel[tx.status] ?? tx.status}</span>
        </div>
        <div className="tx-spinner" aria-label="transaction in progress" />
      </div>

      <div className="tx-track">
        <div className="tx-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="tx-meta">
        <span>{pct}%</span>
        <span>{tx.resultName || tx.execution || "waiting for execution result"}</span>
      </div>

      {tx.receiptStatus === "contract_error" && (
        <div className="tx-detail">Contract execution returned an error. State was not accepted.</div>
      )}

      <div className="tx-hash">{tx.hash}</div>
    </div>
  );
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [history, setHistory] = useState<Verification[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("Terms");
  const [statement, setStatement] = useState("");
  const [deadline, setDeadline] = useState("");

  const [wallet, setWallet] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [tx, setTx] = useState<TxProgress | null>(null);
  const refreshInFlight = useRef(false);

  const live = isConfigured();
  const selected = projects.find((p) => p.id === selectedId) ?? projects[0];

  const stats = useMemo(() => {
    const items = selected
      ? commitments.filter((c) => c.projectId === selected.id)
      : commitments;

    return {
      monitored: projects.length,
      commitments: items.length,
      fulfilled: items.filter((c) => c.status === "FULFILLED").length,
      alerts: items.filter((c) => ["BROKEN", "UNVERIFIABLE"].includes(c.status)).length,
      score: selected?.score ?? 0,
    };
  }, [projects, commitments, selected]);

  useEffect(() => {
    if (live) void refresh(true);
  }, [live]);

  async function refresh(silent = false) {
    if (!live) {
      if (!silent) setNotice("Contract is not configured.");
      return;
    }
    if (refreshInFlight.current) return;

    refreshInFlight.current = true;
    setLoading(true);

    try {
      const [pc, cc, vc] = await Promise.all([
        readContract("get_project_count"),
        readContract("get_commitment_count"),
        readContract("get_verification_count"),
      ]);

      const readRange = async <T,>(
        count: number,
        limit: number,
        reader: (index: number) => Promise<T>,
      ): Promise<T[]> => {
        const total = Math.min(Math.max(0, count), limit);
        const result: T[] = [];

        for (let start = 0; start < total; start += 20) {
          const indexes = Array.from(
            { length: Math.min(20, total - start) },
            (_, offset) => start + offset,
          );
          result.push(...(await Promise.all(indexes.map(reader))));
        }

        return result;
      };

      const [rawProjects, rawCommitments, rawHistory] = await Promise.all([
        readRange(Number(pc), 100, (i) => readContract("get_project", [i])),
        readRange(Number(cc), 300, (i) => readContract("get_commitment", [i])),
        readRange(Number(vc), 500, (i) => readContract("get_verification", [i])),
      ]);

      const nextProjects = rawProjects.map((raw, i) => toProject(raw, i));
      const nextCommitments = rawCommitments.map((raw, i) => toCommitment(raw, i));
      const nextHistory = rawHistory.map((raw, i) => toVerification(raw, i)).reverse();

      setProjects(nextProjects);
      setCommitments(nextCommitments);
      setHistory(nextHistory);

      if (
        nextProjects.length &&
        (selectedId === null || !nextProjects.some((p) => p.id === selectedId))
      ) {
        setSelectedId(nextProjects[0].id);
      }

      if (!silent) setNotice("Live state synchronized from GenLayer.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not read contract state.");
    } finally {
      refreshInFlight.current = false;
      setLoading(false);
    }
  }

  async function findProjectIdByUrl(targetUrl: string) {
    const normalized = targetUrl.trim().replace(/\/$/, "");
    const count = Number(await readContract("get_project_count"));

    for (let start = 0; start < Math.min(count, 100); start += 20) {
      const indexes = Array.from(
        { length: Math.min(20, Math.min(count, 100) - start) },
        (_, offset) => start + offset,
      );
      const rows = await Promise.all(indexes.map((i) => readContract("get_project", [i])));

      for (let offset = 0; offset < rows.length; offset += 1) {
        const existingUrl = String(field(rows[offset], 1, "url", "")).replace(/\/$/, "");
        if (existingUrl === normalized) return indexes[offset];
      }
    }

    return null;
  }

  async function connectWallet() {
    try {
      if (!window.ethereum) throw new Error("Install a compatible browser wallet.");
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setWallet(accounts?.[0] ?? "");
      setNotice("Wallet connected.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Wallet connection failed.");
    }
  }

  async function execute(
    functionName: string,
    args: any[],
    stateCheck?: () => Promise<boolean>,
  ) {
    setBusy(true);

    try {
      const { hash, client } = await writeContract(functionName, args);
      setTx({
        hash,
        status: "PENDING",
        execution: "NOT_VOTED",
        resultName: "",
        receiptStatus: "",
        success: false,
      });

      const accepted = await waitForAccepted(client, hash, setTx);

      if (stateCheck) {
        const changed = await waitForState(stateCheck, (value) => value === true);
        if (!changed) {
          throw new Error(
            `Transaction reached consensus but the expected contract state was not observed yet. Hash: ${hash}`,
          );
        }
      }

      await refresh(true);

      void watchFinalized(client, hash, setTx)
        .then((final) => {
          setTx(final);

          if (final.status === "FINALIZED" && final.success) {
            void refresh(true);
            setNotice("Transaction finalized and contract state updated.");
            window.setTimeout(() => setTx(null), 3500);
          } else if (!final.success) {
            setNotice(
              `Transaction finalized without a successful contract execution. ` +
                `${final.resultName || final.execution}.`,
            );
          }
        })
        .catch((error) => {
          setNotice(error instanceof Error ? error.message : "Transaction monitoring failed.");
        });

      return accepted;
    } catch (error) {
      setTx((current) =>
        current
          ? {
              ...current,
              success: false,
              status:
                current.status === "PENDING" ||
                current.status === "PROPOSING" ||
                current.status === "COMMITTING" ||
                current.status === "REVEALING"
                  ? "UNKNOWN"
                  : current.status,
            }
          : null,
      );
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function protectWebsite() {
    const target = url.trim();

    if (!target) {
      setNotice("Paste the public website URL first.");
      return;
    }

    let projectName = name.trim();
    if (!projectName) {
      try {
        projectName = new URL(target).hostname.replace(/^www\./, "");
      } catch {
        projectName = "Monitored project";
      }
    }

    try {
      const existing = await findProjectIdByUrl(target);

      if (existing !== null) {
        setSelectedId(existing);
        setNotice("This website is already protected. Running verification now.");
        await verifyProjectById(existing);
        return;
      }

      const before = Number(await readContract("get_project_count"));

      await execute("protect_website", [projectName, target, category], async () => {
        return Number(await readContract("get_project_count")) > before;
      });

      const projectId = await findProjectIdByUrl(target);

      if (projectId === null) {
        throw new Error("The project was accepted but is not readable yet. Wait for finality.");
      }

      setSelectedId(projectId);
      await refresh(true);

      // Automatically run the actual verification after baseline creation.
      await verifyProjectById(projectId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Protection failed.");
    }
  }

  async function verifyProjectById(projectId: number) {
    try {
      const before = Number(await readContract("get_verification_count"));

      await execute("verify_project", [projectId], async () => {
        return Number(await readContract("get_verification_count")) > before;
      });

      await refresh(true);
      setNotice("Verification completed. Results are now stored on-chain.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Verification failed.");
    }
  }

  async function verifySelected() {
    if (!selected) {
      setNotice("Add a website first.");
      return;
    }
    await verifyProjectById(selected.id);
  }

  async function addManualCommitment(e: React.FormEvent) {
    e.preventDefault();

    if (!selected || !statement.trim()) {
      setNotice("Select a project and enter the commitment.");
      return;
    }

    try {
      const before = Number(await readContract("get_commitment_count"));

      await execute(
        "add_commitment",
        [selected.id, statement.trim(), deadline.trim()],
        async () => Number(await readContract("get_commitment_count")) > before,
      );

      setStatement("");
      setDeadline("");
      await refresh(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not anchor commitment.");
    }
  }

  return (
    <>
      <main className="app tg-v31">
        <header className="topbar">
          <div className="brand">
            <div className="logo">T</div>
            <div>
              <strong>TermsGuard</strong>
              <span>verifiable public commitments</span>
            </div>
          </div>

          <div className="top-actions">
            <span className="network">
              {networkName()} {live ? "LIVE" : "SETUP NEEDED"}
            </span>
            <button className="button ghost" onClick={connectWallet}>
              {wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : "Connect wallet"}
            </button>
          </div>
        </header>

        <section className="hero">
          <div>
            <p className="eyebrow">PUBLIC COMMITMENT MONITOR</p>
            <h1>Protect a website.<br />See what changes.</h1>
            <p className="hero-copy">
              TermsGuard captures a consensus-backed semantic baseline, discovers
              public commitments and verifies the current state with GenLayer.
            </p>
          </div>

          <div className="protect-card">
            <label>Website URL</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://project.com"
              disabled={busy}
            />
            <div className="protect-row">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Project name (optional)"
                disabled={busy}
              />
              <select value={category} onChange={(e) => setCategory(e.target.value)} disabled={busy}>
                <option>Terms</option>
                <option>Roadmap</option>
                <option>Docs</option>
                <option>Tokenomics</option>
                <option>Governance</option>
                <option>Other</option>
              </select>
            </div>
            <button className="button primary" onClick={protectWebsite} disabled={busy || !live}>
              {busy ? "Working…" : "Protect website"}
            </button>
            <small>One wallet confirmation. Baseline, discovery and verification are handled automatically.</small>
          </div>
        </section>

        <TxPanel tx={tx} />

        {notice && <div className="notice">{notice}</div>}

        <section className="stats-grid">
          <div><span>Monitored</span><b>{stats.monitored}</b></div>
          <div><span>Commitments</span><b>{stats.commitments}</b></div>
          <div><span>Fulfilled</span><b>{stats.fulfilled}</b></div>
          <div><span>Alerts</span><b>{stats.alerts}</b></div>
          <div><span>Trust score</span><b>{selected?.score ? `${selected.score}/100` : "—"}</b></div>
        </section>

        <section className="content-grid">
          <div className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">MONITORED PROJECTS</p>
                <h2>Project state</h2>
              </div>
              <button className="button ghost" onClick={() => refresh()} disabled={loading}>
                {loading ? "Syncing…" : "Refresh"}
              </button>
            </div>

            {projects.length === 0 ? (
              <div className="empty">Add a public website above to start monitoring.</div>
            ) : (
              <div className="project-list">
                {projects.map((project) => (
                  <button
                    key={project.id}
                    className={`project-row ${selected?.id === project.id ? "selected" : ""}`}
                    onClick={() => setSelectedId(project.id)}
                  >
                    <span className="project-dot" />
                    <span className="project-main">
                      <b>{project.name}</b>
                      <small>{project.url}</small>
                    </span>
                    <span className={`status ${badge(project.status)}`}>{project.status}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">VERIFICATION</p>
                <h2>{selected ? selected.name : "No project selected"}</h2>
              </div>
              <button className="button primary" onClick={verifySelected} disabled={!selected || busy}>
                Verify again
              </button>
            </div>

            {selected ? (
              <>
                <div className="score">
                  <div className="score-number">{selected.score || "—"}</div>
                  <div>
                    <b>{selected.status}</b>
                    <p>{selected.summary || "Waiting for verification."}</p>
                  </div>
                </div>

                <div className="commitment-list">
                  {commitments.filter((c) => c.projectId === selected.id).length === 0 ? (
                    <div className="empty">No public commitments were discovered yet.</div>
                  ) : (
                    commitments
                      .filter((c) => c.projectId === selected.id)
                      .map((item) => (
                        <div className="commitment" key={item.id}>
                          <div className="commitment-top">
                            <span className={`status ${badge(item.status)}`}>{item.status}</span>
                            {item.deadline && <small>{item.deadline}</small>}
                          </div>
                          <b>{item.statement}</b>
                          {item.evidence && <p>{item.evidence}</p>}
                        </div>
                      ))
                  )}
                </div>
              </>
            ) : (
              <div className="empty">Your verification result will appear here.</div>
            )}
          </div>
        </section>

        <section className="panel history-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">AUDIT TRAIL</p>
              <h2>Recent consensus results</h2>
            </div>
            <span className="network">ON-CHAIN</span>
          </div>

          {history.length === 0 ? (
            <div className="empty">No verification records yet.</div>
          ) : (
            <div className="history-list">
              {history.slice(0, 12).map((item) => (
                <div className="history-row" key={item.id}>
                  <span className={`status ${badge(item.status)}`}>{item.status}</span>
                  <span>{item.kind}</span>
                  <span className="history-summary">{item.summary}</span>
                  <span>{item.score}/100</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel advanced">
          <div className="panel-head">
            <div>
              <p className="eyebrow">ADVANCED</p>
              <h2>Manual commitment</h2>
            </div>
          </div>

          <form className="manual-form" onSubmit={addManualCommitment}>
            <input
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder="Optional commitment statement"
              disabled={!selected || busy}
            />
            <input
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              placeholder="Deadline YYYY-MM-DD"
              disabled={!selected || busy}
            />
            <button className="button ghost" type="submit" disabled={!selected || busy}>
              Anchor
            </button>
          </form>
        </section>
      </main>

      <style jsx>{`
        .tg-v31 { max-width: 1180px; margin: 0 auto; padding: 28px 22px 80px; }
        .hero { display:grid; grid-template-columns:1.25fr .85fr; gap:32px; padding:64px 0 34px; align-items:center; }
        .eyebrow { margin:0 0 10px; font-size:11px; letter-spacing:.16em; opacity:.62; }
        h1 { font-size:clamp(42px,6vw,76px); line-height:.95; margin:0 0 20px; letter-spacing:-.055em; }
        .hero-copy { max-width:650px; font-size:17px; line-height:1.65; opacity:.72; }
        .protect-card,.panel,.tx-panel,.notice { border:1px solid rgba(255,255,255,.1); background:rgba(255,255,255,.035); border-radius:22px; padding:22px; box-shadow:0 18px 60px rgba(0,0,0,.16); }
        .protect-card label { display:block; font-size:12px; opacity:.7; margin-bottom:8px; }
        input,select { width:100%; box-sizing:border-box; border:1px solid rgba(255,255,255,.12); background:rgba(0,0,0,.18); color:inherit; border-radius:12px; padding:13px 14px; outline:none; }
        .protect-row,.manual-form { display:grid; grid-template-columns:1fr 170px; gap:10px; margin-top:10px; }
        .button { border:1px solid rgba(255,255,255,.12); border-radius:12px; padding:12px 15px; cursor:pointer; font-weight:650; background:transparent; color:inherit; }
        .button.primary { width:100%; margin-top:12px; background:rgba(255,255,255,.12); }
        .button.ghost { background:rgba(255,255,255,.04); }
        .button:disabled { opacity:.45; cursor:not-allowed; }
        .protect-card small { display:block; margin-top:10px; font-size:11px; opacity:.55; line-height:1.5; }
        .tx-panel { margin:10px 0 16px; }
        .tx-head { display:flex; justify-content:space-between; align-items:center; gap:16px; }
        .tx-head b,.tx-head span { display:block; }
        .tx-head span { margin-top:4px; opacity:.62; font-size:12px; }
        .tx-spinner { width:22px; height:22px; border-radius:50%; border:2px solid rgba(255,255,255,.18); border-top-color:currentColor; animation:spin .8s linear infinite; }
        .tx-track { height:5px; border-radius:99px; background:rgba(255,255,255,.08); overflow:hidden; margin:18px 0 8px; }
        .tx-fill { height:100%; background:currentColor; transition:width .4s ease; }
        .tx-meta,.tx-hash { display:flex; justify-content:space-between; font-size:11px; opacity:.58; }
        .tx-hash { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:8px; }
        .tx-detail { margin-top:10px; font-size:12px; opacity:.75; }
        .notice { margin-bottom:16px; font-size:13px; line-height:1.5; }
        .stats-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:10px; margin-bottom:16px; }
        .stats-grid > div { padding:18px; border:1px solid rgba(255,255,255,.08); border-radius:16px; background:rgba(255,255,255,.025); }
        .stats-grid span { display:block; font-size:11px; opacity:.55; }
        .stats-grid b { display:block; margin-top:7px; font-size:24px; }
        .content-grid { display:grid; grid-template-columns:.9fr 1.1fr; gap:16px; }
        .panel { min-width:0; }
        .panel-head { display:flex; justify-content:space-between; gap:18px; align-items:center; margin-bottom:18px; }
        .panel-head h2 { margin:0; font-size:22px; letter-spacing:-.02em; }
        .project-list { display:grid; gap:7px; }
        .project-row { width:100%; display:grid; grid-template-columns:10px 1fr auto; gap:12px; align-items:center; text-align:left; color:inherit; background:transparent; border:1px solid transparent; border-radius:14px; padding:13px; cursor:pointer; }
        .project-row:hover,.project-row.selected { background:rgba(255,255,255,.045); border-color:rgba(255,255,255,.08); }
        .project-dot { width:8px; height:8px; border-radius:50%; background:currentColor; }
        .project-main b,.project-main small { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .project-main small { margin-top:4px; opacity:.5; font-size:11px; }
        .status { font-size:10px; letter-spacing:.08em; padding:5px 8px; border-radius:999px; border:1px solid currentColor; opacity:.9; }
        .status.good { color:#79e2a7; }
        .status.warn { color:#e8c66a; }
        .status.bad { color:#ff7b86; }
        .status.muted { opacity:.5; }
        .score { display:flex; gap:18px; align-items:center; padding:18px; border-radius:16px; background:rgba(255,255,255,.035); }
        .score-number { font-size:46px; line-height:1; font-weight:750; letter-spacing:-.06em; }
        .score p { margin:6px 0 0; opacity:.62; font-size:12px; line-height:1.5; }
        .commitment-list { margin-top:12px; display:grid; gap:8px; max-height:420px; overflow:auto; }
        .commitment { border:1px solid rgba(255,255,255,.08); border-radius:14px; padding:14px; }
        .commitment-top { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px; }
        .commitment-top small { opacity:.5; font-size:11px; }
        .commitment b { font-size:13px; line-height:1.45; }
        .commitment p { margin:8px 0 0; opacity:.55; font-size:11px; line-height:1.45; }
        .history-panel,.advanced { margin-top:16px; }
        .history-list { display:grid; gap:4px; }
        .history-row { display:grid; grid-template-columns:120px 120px 1fr 80px; gap:12px; align-items:center; padding:12px 0; border-top:1px solid rgba(255,255,255,.07); font-size:12px; }
        .history-summary { opacity:.62; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .empty { padding:28px 10px; text-align:center; opacity:.5; font-size:13px; }
        .manual-form { grid-template-columns:1fr 170px 100px; margin:0; }
        @keyframes spin { to { transform:rotate(360deg); } }
        @media (max-width:850px) {
          .hero,.content-grid { grid-template-columns:1fr; }
          .stats-grid { grid-template-columns:repeat(2,1fr); }
          .manual-form,.protect-row { grid-template-columns:1fr; }
          .history-row { grid-template-columns:1fr 1fr; }
        }
      `}</style>
    </>
  );
}
