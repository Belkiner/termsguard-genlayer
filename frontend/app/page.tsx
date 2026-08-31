"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  contractAddress,
  isConfigured,
  networkName,
  readContract,
  waitForAccepted,
  waitForState,
  watchFinalized,
  writeContract,
  type TxProgress,
} from "../lib/genlayer";
import type { Commitment, Mode, Project, Verification } from "../lib/types";

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

export default function Home() {
  const [mode, setMode] = useState<Mode>("simple");
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

  const txProgress = tx
    ? ({
        UNINITIALIZED: 5, PENDING: 12, PROPOSING: 28, COMMITTING: 45,
        REVEALING: 62, LEADER_REVEALING: 58, ACCEPTED: 78,
        READY_TO_FINALIZE: 90, FINALIZED: 100, CANCELED: 100,
        UNDETERMINED: 70, APPEAL_REVEALING: 70, APPEAL_COMMITTING: 76,
        VALIDATORS_TIMEOUT: 100, LEADER_TIMEOUT: 100, UNKNOWN: 15,
      } as Record<string, number>)[tx.status] ?? 15
    : 0;

  const stats = useMemo(() => {
    const items = selected ? commitments.filter((c) => c.projectId === selected.id) : commitments;
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

  useEffect(() => {
    const ethereum = window.ethereum;
    if (!ethereum?.on) return;

    const handleAccountsChanged = (accounts: string[]) => {
      setWallet(accounts?.[0] ?? "");
      if (!accounts?.[0]) setNotice("Wallet disconnected.");
    };
    const handleChainChanged = () => {
      setNotice("Wallet network changed. TermsGuard will use the configured GenLayer network.");
      void refresh(true);
    };

    ethereum.on("accountsChanged", handleAccountsChanged);
    ethereum.on("chainChanged", handleChainChanged);
    return () => {
      ethereum.removeListener?.("accountsChanged", handleAccountsChanged);
      ethereum.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [live]);

  async function refresh(silent = false) {
    if (!live) {
      if (!silent) setNotice("Add your deployed contract address in Vercel Environment Variables.");
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
        const batchSize = 20;
        for (let start = 0; start < total; start += batchSize) {
          const indexes = Array.from(
            { length: Math.min(batchSize, total - start) },
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

      if (nextProjects.length && (selectedId === null || !nextProjects.some((p) => p.id === selectedId))) {
        setSelectedId(nextProjects[0].id);
      }
      if (!silent) setNotice("Live state synchronized from GenLayer.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not read the contract state.");
    } finally {
      refreshInFlight.current = false;
      setLoading(false);
    }
  }

  async function findProjectIdByUrl(targetUrl: string) {
    const normalized = targetUrl.trim().replace(/\/$/, "");
    const count = Number(await readContract("get_project_count"));
    const indexes = Array.from({ length: Math.min(count, 100) }, (_, i) => i);

    for (let start = 0; start < indexes.length; start += 20) {
      const batch = indexes.slice(start, start + 20);
      const rows = await Promise.all(batch.map((i) => readContract("get_project", [i])));
      for (let offset = 0; offset < rows.length; offset += 1) {
        const existingUrl = String(field(rows[offset], 1, "url", "")).replace(/\/$/, "");
        if (existingUrl === normalized) return batch[offset];
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
    success: string,
    stateCheck?: () => Promise<boolean>,
  ) {
    setBusy(true);
    try {
      const { hash, client } = await writeContract(functionName, args);
      setTx({ hash, status: "PENDING" });

      await waitForAccepted(client, hash, setTx);

      if (stateCheck) {
        await waitForState(stateCheck, (value) => value === true);
      }

      await refresh(true);
      setNotice(`${success} The contract execution has been accepted.`);

      void watchFinalized(client, hash, setTx).then((final) => {
        setTx((current) => (current?.hash === hash ? final : current));

        if (final.status === "FINALIZED") {
          void refresh(true);
          setNotice(`${success} Finalized on GenLayer.`);
          window.setTimeout(() => {
            setTx((current) => (current?.hash === hash ? null : current));
          }, 3000);
          return;
        }

        if (["CANCELED", "UNDETERMINED", "VALIDATORS_TIMEOUT", "LEADER_TIMEOUT"].includes(final.status)) {
          setNotice(`Transaction ended with status ${final.status}. Inspect the transaction before retrying.`);
        } else {
          setNotice(`${success} is still processing. Keep this transaction open and do not resubmit it.`);
        }
      }).catch((error) => {
        setNotice(error instanceof Error ? error.message : "Could not continue transaction monitoring.");
      });

      return { hash };
    } catch (error) {
      setTx(null);
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function protectWebsite() {
    if (!url.trim()) {
      setNotice("Paste the public website URL first.");
      return;
    }

    let projectName =
      name.trim() ||
      (() => {
        try {
          return new URL(url).hostname.replace(/^www\./, "");
        } catch {
          return "Monitored project";
        }
      })();

    try {
      const existing = await findProjectIdByUrl(url.trim());

      if (existing !== null) {
        setSelectedId(existing);
        setNotice(
          "This website is already protected. Use Verify again to check its current state.",
        );
        await refresh(true);
        return;
      }

      const before = Number(await readContract("get_project_count"));

      await execute(
        "protect_website",
        [projectName, url.trim(), category],
        "Website protected.",
        async () => {
          const count = Number(await readContract("get_project_count"));
          return count > before;
        },
      );

      const projectId = await findProjectIdByUrl(url.trim());
      if (projectId === null) {
        throw new Error(
          "The transaction was accepted, but the new project is not readable yet. Wait for finality and refresh.",
        );
      }

      setSelectedId(projectId);
      setMode("simple");
      await refresh(true);
      setNotice(
        "Website protected. Baseline and public commitments were captured in the same transaction. Run Verify again later for a real current-state check.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Automatic setup failed.");
    }
  }

  async function verifySelected() {
    if (!selected) {
      setNotice("Add a website first.");
      return;
    }
    try {
      const beforeVerifications = Number(await readContract("get_verification_count"));
      await execute(
        "verify_project",
        [selected.id],
        "Verification completed.",
        async () => Number(await readContract("get_verification_count")) > beforeVerifications,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Verification failed.");
    }
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
        "Commitment anchored.",
        async () => Number(await readContract("get_commitment_count")) > before,
      );
      setStatement("");
      setDeadline("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not anchor commitment.");
    }
  }

  const steps = [
    ["1", "Website", selected ? "Connected" : "Paste a URL"],
    ["2", "Baseline", selected?.baseline ? "Captured" : "Not captured"],
    ["3", "Commitments", `${stats.commitments} discovered`],
    ["4", "Verification", selected?.status ?? "Waiting"],
  ];

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <div className="logo">T</div>
          <div>
            <strong>TermsGuard</strong>
            <span>verifiable public commitments</span>
          </div>
        </div>
        <div className="top-actions">
          <span className="network">{networkName()} {live ? "LIVE" : "SETUP NEEDED"}</span>
          <button className="button ghost" onClick={connectWallet}>
            {wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : "Connect wallet"}
          </button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="kicker">PUBLIC PROMISES → EVIDENCE → CONSENSUS</span>
          <h1>Know whether a project is doing what it publicly said it would.</h1>
          <p>
            Paste a website. TermsGuard captures its public baseline, finds meaningful
            commitments, and lets GenLayer verify what changed and what was fulfilled.
          </p>
          <div className="mode-switch">
            {([
              ["simple", "Simple", "One workflow"],
              ["advanced", "Advanced", "More control"],
              ["audit", "Audit", "Full evidence"],
            ] as const).map(([id, label, hint]) => (
              <button key={id} className={mode === id ? "mode active" : "mode"} onClick={() => setMode(id)}>
                <b>{label}</b><span>{hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="health-card">
          <span>TRUST SCORE</span>
          <strong>{selected && selected.status !== "BASELINED" ? selected.score : "—"}<small>/100</small></strong>
          <p>{selected?.summary || "Add a public project to start monitoring."}</p>
          <div className="health-line"><i style={{ width: `${selected?.score ?? 0}%` }} /></div>
        </div>
      </section>

      <section className="workspace">
        <aside className="sidebar">
          <div className="sidebar-head">
            <div><span className="label">MONITORED</span><h2>Projects</h2></div>
            <button className="icon" disabled={loading} onClick={() => void refresh()}>{loading ? "…" : "↻"}</button>
          </div>

          {projects.length === 0 ? (
            <div className="empty-side">
              <div className="empty-icon">+</div>
              <b>No monitored projects</b>
              <span>Start with a public URL in Simple mode.</span>
            </div>
          ) : (
            <div className="project-list">
              {projects.map((p) => (
                <button key={p.id} className={selected?.id === p.id ? "project active" : "project"} onClick={() => setSelectedId(p.id)}>
                  <span className="avatar">{p.name.slice(0, 1).toUpperCase()}</span>
                  <span className="project-copy"><b>{p.name}</b><small>{p.url.replace(/^https?:\/\//, "").slice(0, 32)}</small></span>
                  <em className={`badge ${badge(p.status)}`}>{p.status}</em>
                </button>
              ))}
            </div>
          )}

          {mode !== "simple" && (
            <form className="manual-form" onSubmit={async (e) => {
              e.preventDefault();
              await protectWebsite();
            }}>
              <span className="label">ADD SOURCE</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name (optional)" />
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://project.xyz" />
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option>Terms</option><option>Docs</option><option>Roadmap</option>
                <option>Tokenomics</option><option>Privacy</option><option>Other</option>
              </select>
              <button className="button primary" disabled={busy}>Protect website</button>
            </form>
          )}
        </aside>

        <section className="main">
          {mode === "simple" && (
            <div className="simple-view">
              <div className="card intro-card">
                <span className="label">START MONITORING</span>
                <h2>One website. One click to start monitoring.</h2>
                <p>TermsGuard captures the public baseline and discovers public commitments in one on-chain transaction. Later verification checks the live page against that baseline.</p>
                <div className="url-row">
                  <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-project.com" />
                  <button className="button primary large" disabled={busy || !live} onClick={() => void protectWebsite()}>
                    {busy ? "Working…" : "Protect & verify"}
                  </button>
                </div>
                {!live && <div className="warning">The frontend is ready, but no valid deployed contract address is configured.</div>}
              </div>

              <div className="steps">
                {steps.map(([n, title, state]) => (
                  <div className="step" key={n}><b>{n}</b><span><strong>{title}</strong><small>{state}</small></span></div>
                ))}
              </div>

              {selected && (
                <div className="card project-summary">
                  <div className="summary-head">
                    <div><span className="label">CURRENT PROJECT</span><h2>{selected.name}</h2><a href={selected.url} target="_blank" rel="noreferrer">{selected.url}</a></div>
                    <em className={`badge ${badge(selected.status)}`}>{selected.status}</em>
                  </div>
                  <div className="summary-grid">
                    <div><span>Commitments</span><strong>{stats.commitments}</strong></div>
                    <div><span>Fulfilled</span><strong>{stats.fulfilled}</strong></div>
                    <div><span>Alerts</span><strong>{stats.alerts}</strong></div>
                    <div><span>Score</span><strong>{stats.score}/100</strong></div>
                  </div>
                  <button className="button dark large" disabled={busy || !selected.baseline} onClick={() => void verifySelected()}>
                    {busy ? "Verifying…" : "Verify again"}
                  </button>
                  <p className="help">Verification compares the live public page against the stored baseline and registered commitments using GenLayer consensus.</p>
                </div>
              )}
            </div>
          )}

          {mode === "advanced" && (
            <div className="advanced-view">
              <div className="card">
                <div className="section-head"><div><span className="label">CONTROL CENTER</span><h2>Advanced monitoring</h2></div><button className="button dark" disabled={!selected || busy} onClick={() => void verifySelected()}>Verify now</button></div>
                <p className="subtle">Automatic discovery is the default. Add a specific commitment when you need an exact statement to be tracked.</p>
              </div>

              {selected && (
                <form className="card manual-commitment" onSubmit={addManualCommitment}>
                  <span className="label">ANCHOR A SPECIFIC COMMITMENT</span>
                  <textarea value={statement} onChange={(e) => setStatement(e.target.value)} placeholder="Example: We will keep the withdrawal fee below 0.5%." />
                  <div className="two"><input value={deadline} onChange={(e) => setDeadline(e.target.value)} placeholder="Deadline (optional)" /><button className="button primary" disabled={busy}>Anchor commitment</button></div>
                </form>
              )}

              <div className="cards">
                {commitments.filter((c) => !selected || c.projectId === selected.id).map((c) => (
                  <article className="commitment" key={c.id}>
                    <div className="card-top"><em className={`badge ${badge(c.status)}`}>{c.status}</em><span>{c.deadline || "No deadline"}</span></div>
                    <h3>{c.statement}</h3>
                    <p>{c.evidence || "No evidence yet. Run verification."}</p>
                    <strong>{c.score}/100</strong>
                  </article>
                ))}
              </div>
            </div>
          )}

          {mode === "audit" && (
            <div className="audit-view">
              <div className="card audit-header">
                <span className="label">AUDIT MODE</span>
                <h2>Evidence, consensus and transaction history</h2>
                <div className="audit-meta"><span>Network <b>{networkName()}</b></span><span>Contract <code>{contractAddress()}</code></span></div>
              </div>

              <div className="history">
                {history.filter((h) => !selected || h.projectId === selected.id).map((h) => (
                  <article className="history-item" key={h.id}>
                    <div className="dot" />
                    <div className="history-body">
                      <div className="card-top"><em className={`badge ${badge(h.status)}`}>{h.status}</em><span>{h.kind}</span></div>
                      <h3>{h.summary}</h3>
                      <p>{h.evidence || "No evidence summary stored."}</p>
                      <strong>{h.score}/100</strong>
                    </div>
                  </article>
                ))}
                {history.length === 0 && <div className="empty">No verification records yet. Run a verification from Simple or Advanced mode.</div>}
              </div>
            </div>
          )}
        </section>
      </section>

      {notice && <div className="notice">{notice}<button onClick={() => setNotice("")}>×</button></div>}

      {tx && (
        <div className="tx-overlay">
          <div className="tx-modal">
            <span className="label">TERMSGUARD · GENLAYER</span>
            <h2>{tx.status === "FINALIZED" ? "Verification finalized" : tx.status === "ACCEPTED" ? "Consensus accepted" : "Processing transaction"}</h2>
            <p className="tx-stage">{tx.status === "PENDING" ? "Queued" : tx.status === "PROPOSING" ? "Validators are proposing" : tx.status === "COMMITTING" ? "Validators are committing" : tx.status === "REVEALING" ? "Validators are revealing" : tx.status === "ACCEPTED" ? "State accepted; finality is still pending" : tx.status === "FINALIZED" ? "Finalized and immutable" : tx.status}</p>
            <div className="tx-track"><i className={tx.status === "FINALIZED" ? "done" : ""} style={{ width: `${txProgress}%` }} /></div>
            <div className="tx-hash"><span>TRANSACTION</span><code>{tx.hash.slice(0, 12)}…{tx.hash.slice(-10)}</code></div>
            <small>Do not submit the same action again while this transaction is processing.</small>
          </div>
        </div>
      )}

      <footer>
        <span>TermsGuard · GenLayer Intelligent Contract</span>
        <span>Consensus-backed semantic verification, not a cosmetic page diff.</span>
      </footer>
    </main>
  );
}
