"use client";

import { useEffect, useMemo, useState } from "react";
import StatusBadge from "../components/StatusBadge";
import StatCard from "../components/StatCard";
import { demoCommitments, demoHistory, demoProjects } from "../lib/demo";
import {
  isLive,
  readContract,
  waitForAccepted,
  waitForState,
  watchFinalized,
  writeContract,
  type TransactionProgress,
} from "../lib/genlayer";
import type { Commitment, Project, Verification } from "../lib/types";

function field(raw: any, index: number, key: string, fallback: any = "") {
  if (Array.isArray(raw)) return raw[index] ?? fallback;
  if (raw && typeof raw === "object") {
    if (raw[key] !== undefined) return raw[key];
    for (const container of [raw.data, raw.result, raw.value]) {
      if (container && typeof container === "object") {
        if (Array.isArray(container)) return container[index] ?? fallback;
        if (container[key] !== undefined) return container[key];
      }
    }
  }
  return fallback;
}

function projectFromRaw(raw: any, id: number): Project {
  return {
    id,
    name: String(field(raw, 0, "name", `Project ${id}`)),
    url: String(field(raw, 1, "url", "")),
    category: String(field(raw, 2, "category", "Other")),
    baseline: String(field(raw, 3, "baseline", "")),
    status: String(field(raw, 4, "status", "UNKNOWN")),
    score: Number(field(raw, 5, "score", 0)),
    summary: String(field(raw, 6, "summary", "No summary available.")),
  };
}

function commitmentFromRaw(raw: any, id: number): Commitment {
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

function verificationFromRaw(raw: any, id: number): Verification {
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

export default function Home() {
  const [tab, setTab] = useState<"overview" | "commitments" | "history">("overview");
  const [projects, setProjects] = useState<Project[]>(demoProjects);
  const [commitments, setCommitments] = useState<Commitment[]>(demoCommitments);
  const [history, setHistory] = useState<Verification[]>(demoHistory);
  const [selectedId, setSelectedId] = useState(0);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("Terms");
  const [statement, setStatement] = useState("");
  const [deadline, setDeadline] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [wallet, setWallet] = useState("");
  const [txProgress, setTxProgress] = useState<TransactionProgress | null>(null);

  const selected = projects.find((p) => p.id === selectedId) ?? projects[0];
  const live = isLive();

  useEffect(() => {
    if (!live) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  const stats = useMemo(
    () => ({
      monitored: projects.length,
      commitments: commitments.length,
      critical: projects.filter((p) => p.status === "CRITICAL").length,
      fulfilled: commitments.filter((c) => c.status === "FULFILLED").length,
      average: projects.length
        ? Math.round(projects.reduce((sum, p) => sum + p.score, 0) / projects.length)
        : 0,
    }),
    [projects, commitments],
  );

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

  async function refresh(silent = false) {
    if (!live) {
      if (!silent) setNotice("Demo Mode is using local sample data.");
      return;
    }

    setBusy(true);
    try {
      const projectCount = Number(await readContract("get_project_count"));
      const commitmentCount = Number(await readContract("get_commitment_count"));
      const verificationCount = Number(await readContract("get_verification_count"));

      const nextProjects: Project[] = [];
      const nextCommitments: Commitment[] = [];
      const nextHistory: Verification[] = [];

      for (let i = 0; i < Math.min(projectCount, 100); i += 1) {
        nextProjects.push(projectFromRaw(await readContract("get_project", [i]), i));
      }
      for (let i = 0; i < Math.min(commitmentCount, 200); i += 1) {
        nextCommitments.push(
          commitmentFromRaw(await readContract("get_commitment", [i]), i),
        );
      }
      for (let i = 0; i < Math.min(verificationCount, 200); i += 1) {
        nextHistory.push(
          verificationFromRaw(await readContract("get_verification", [i]), i),
        );
      }

      setProjects(nextProjects);
      setCommitments(nextCommitments);
      setHistory(nextHistory.reverse());

      if (!nextProjects.some((p) => p.id === selectedId) && nextProjects[0]) {
        setSelectedId(nextProjects[0].id);
      }

      if (!silent) setNotice("Synced with GenLayer.");
    } catch (error) {
      if (!silent) {
        setNotice(error instanceof Error ? error.message : "Could not sync contract.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function afterWrite(
    hash: string,
    client: any,
    successText: string,
    stateCheck: () => Promise<boolean>,
  ) {
    await waitForAccepted(client, hash, setTxProgress);

    // Do not refresh once and assume the old state means failure.
    // Wait until the new state is visible through the read RPC.
    await waitForState(
      async () => stateCheck(),
      (visible) => visible === true,
      { intervalMs: 2500, maxChecks: 48 },
    );

    await refresh(true);
    setNotice(successText);

    // FINALIZED is tracked separately. A slow finalization must not make
    // an already accepted/executed contract call look like a failed call.
    void watchFinalized(client, hash, setTxProgress).then((finalProgress) => {
      if (finalProgress.status === "FINALIZED") {
        setNotice(`${successText} Transaction finalized.`);
      }
      window.setTimeout(() => setTxProgress(null), 1200);
    });
  }

  async function createProject(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !url.trim()) {
      setNotice("Project name and URL are required.");
      return;
    }

    if (!live) {
      const p: Project = {
        id: Date.now(),
        name,
        url,
        category,
        baseline: "",
        status: "PENDING",
        score: 0,
        summary: "Created locally. Deploy the contract to persist it on-chain.",
      };
      setProjects((items) => [p, ...items]);
      setSelectedId(p.id);
      setName("");
      setUrl("");
      setNotice("Project created in Demo Mode.");
      return;
    }

    setBusy(true);
    try {
      const before = Number(await readContract("get_project_count"));
      const { hash, client } = await writeContract("create_project", [name, url, category]);

      await afterWrite(
        hash,
        client,
        "Project registered on GenLayer.",
        async () => Number(await readContract("get_project_count")) > before,
      );

      setName("");
      setUrl("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Project creation failed.");
      setTxProgress(null);
    } finally {
      setBusy(false);
    }
  }

  async function captureBaseline() {
    if (!selected) return;
    if (!live) {
      setNotice("Deploy the contract to capture an on-chain baseline.");
      return;
    }

    setBusy(true);
    try {
      const projectId = selected.id;
      const { hash, client } = await writeContract("capture_baseline", [projectId]);

      await afterWrite(
        hash,
        client,
        "Baseline captured with GenLayer consensus.",
        async () => {
          const raw = await readContract("get_project", [projectId]);
          const project = projectFromRaw(raw, projectId);
          return project.status === "BASELINED" && project.baseline.length > 0;
        },
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Baseline capture failed.");
      setTxProgress(null);
    } finally {
      setBusy(false);
    }
  }

  async function verifyProject() {
    if (!selected) return;

    if (!live) {
      const updated = {
        ...selected,
        status: "NO_CHANGE",
        score: 97,
        summary: "Demo consensus: no material policy change detected.",
      };
      setProjects((items) =>
        items.map((p) => (p.id === selected.id ? updated : p)),
      );
      setHistory((items) => [
        {
          id: Date.now(),
          projectId: selected.id,
          kind: "POLICY",
          itemId: selected.id,
          status: "NO_CHANGE",
          score: 97,
          summary: updated.summary,
          evidence:
            "Demo evidence: fees, access and governance remain materially equivalent.",
        },
        ...items,
      ]);
      setNotice("Demo verification completed.");
      return;
    }

    setBusy(true);
    try {
      const projectId = selected.id;
      const beforeHistory = Number(await readContract("get_verification_count"));
      const { hash, client } = await writeContract("verify_project", [projectId]);

      await afterWrite(
        hash,
        client,
        "Policy verification accepted by consensus.",
        async () => Number(await readContract("get_verification_count")) > beforeHistory,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Verification failed.");
      setTxProgress(null);
    } finally {
      setBusy(false);
    }
  }

  async function addCommitment(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !statement.trim()) {
      setNotice("Choose a project and enter a commitment.");
      return;
    }

    if (!live) {
      const item: Commitment = {
        id: Date.now(),
        projectId: selected.id,
        statement,
        deadline,
        status: "OPEN",
        score: 0,
        evidence: "Awaiting live GenLayer verification.",
      };
      setCommitments((items) => [item, ...items]);
      setStatement("");
      setDeadline("");
      setNotice("Commitment created in Demo Mode.");
      return;
    }

    setBusy(true);
    try {
      const before = Number(await readContract("get_commitment_count"));
      const { hash, client } = await writeContract("add_commitment", [
        selected.id,
        statement,
        deadline,
      ]);

      await afterWrite(
        hash,
        client,
        "Commitment anchored on GenLayer.",
        async () => Number(await readContract("get_commitment_count")) > before,
      );

      setStatement("");
      setDeadline("");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Commitment creation failed.",
      );
      setTxProgress(null);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCommitment(id: number) {
    if (!live) {
      setCommitments((items) =>
        items.map((c) =>
          c.id === id
            ? {
                ...c,
                status: "FULFILLED",
                score: 93,
                evidence: "Demo evidence supports completion.",
              }
            : c,
        ),
      );
      setNotice("Demo commitment verification completed.");
      return;
    }

    setBusy(true);
    try {
      const beforeHistory = Number(await readContract("get_verification_count"));
      const { hash, client } = await writeContract("verify_commitment", [id]);

      await afterWrite(
        hash,
        client,
        "Commitment verification accepted by consensus.",
        async () => Number(await readContract("get_verification_count")) > beforeHistory,
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Commitment verification failed.",
      );
      setTxProgress(null);
    } finally {
      setBusy(false);
    }
  }

  const txLabel: Record<string, string> = {
    PENDING: "Transaction queued",
    PROPOSING: "GenLayer validators are proposing",
    COMMITTING: "Validators are committing votes",
    REVEALING: "Validators are revealing votes",
    ACCEPTED: "Consensus accepted — syncing state",
    READY_TO_FINALIZE: "Ready to finalize",
    FINALIZED: "Verification finalized",
    CANCELED: "Transaction canceled",
    UNDETERMINED: "Consensus is undetermined",
    VALIDATORS_TIMEOUT: "Validators timed out",
    LEADER_TIMEOUT: "Leader timed out",
    UNKNOWN: "Checking transaction status",
  };

  const txSteps = [
    "PENDING",
    "PROPOSING",
    "COMMITTING",
    "REVEALING",
    "ACCEPTED",
    "FINALIZED",
  ];
  const txIndex = txProgress ? txSteps.indexOf(txProgress.status) : -1;

  return (
    <main>
      {txProgress && (
        <div className="tx-overlay" role="status" aria-live="polite">
          <div className="tx-modal">
            <div className="tx-orbit">
              <div className="tx-core">T</div>
            </div>
            <span className="section-label">TERMSGUARD · CONSENSUS</span>
            <h2>
              {txProgress.status === "FINALIZED"
                ? "Verification finalized"
                : txProgress.status === "ACCEPTED"
                  ? "Consensus accepted"
                  : "Verification in progress"}
            </h2>
            <p className="tx-stage">
              {txLabel[txProgress.status] ?? "Processing transaction"}
            </p>
            <div className="tx-steps">
              {txSteps.map((step, index) => (
                <div
                  className={`tx-step ${index < txIndex ? "done" : ""} ${
                    step === txProgress.status ? "current" : ""
                  }`}
                  key={step}
                >
                  <span>{index < txIndex ? "✓" : index + 1}</span>
                  <small>{step}</small>
                </div>
              ))}
            </div>
            <div className="tx-hash">
              <span>TRANSACTION</span>
              <code>
                {txProgress.hash.slice(0, 10)}…{txProgress.hash.slice(-8)}
              </code>
            </div>
            {txProgress.status === "UNKNOWN" && (
              <small className="tx-note">
                Still checking the network. Do not submit the same action again.
              </small>
            )}
            {txProgress.status === "ACCEPTED" && (
              <small className="tx-note success">
                Consensus accepted. Waiting for the updated contract state…
              </small>
            )}
            {txProgress.status === "FINALIZED" && (
              <small className="tx-note success">
                Finalized on GenLayer.
              </small>
            )}
          </div>
        </div>
      )}

      <header className="nav shell">
        <div className="brand">
          <div className="brand-mark">T</div>
          <div>
            <strong>TermsGuard</strong>
            <small>semantic verification layer</small>
          </div>
        </div>
        <div className="nav-right">
          <span className={live ? "network live" : "network"}>
            {live ? "GENLAYER LIVE" : "DEMO MODE"}
          </span>
          <button className="button ghost" onClick={connectWallet}>
            {wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : "Connect wallet"}
          </button>
        </div>
      </header>

      <section className="hero shell">
        <div className="hero-copy">
          <span className="eyebrow">PUBLIC COMMITMENTS · POLICY · EVIDENCE</span>
          <h1>
            Turn promises into
            <br />
            <em>verifiable history.</em>
          </h1>
          <p>
            TermsGuard registers public project commitments and policies, then
            uses GenLayer to adjudicate whether the evidence still supports them.
          </p>
          <div className="hero-actions">
            <button className="button primary" onClick={() => setTab("commitments")}>
              Create commitment
            </button>
            <button
              className="button ghost"
              onClick={() => void refresh()}
              disabled={busy}
            >
              Sync network
            </button>
          </div>
        </div>
        <div className="hero-card">
          <div className="pulse"></div>
          <span>CONSENSUS LAYER</span>
          <strong>
            {stats.fulfilled}/{stats.commitments || 0}
          </strong>
          <small>commitments fulfilled</small>
        </div>
      </section>

      <section className="shell stats">
        <StatCard label="Monitored" value={stats.monitored} hint="public sources" />
        <StatCard label="Commitments" value={stats.commitments} hint="anchored statements" />
        <StatCard label="Fulfilled" value={stats.fulfilled} hint="evidence-supported" />
        <StatCard label="Stability" value={`${stats.average}/100`} hint="semantic score" />
      </section>

      <section className="shell layout">
        <aside className="sidebar panel">
          <div className="panel-title">
            <div>
              <span>REGISTRY</span>
              <h2>Projects</h2>
            </div>
            <button className="icon-button" onClick={() => void refresh()}>
              ↻
            </button>
          </div>

          <div className="project-list">
            {projects.map((project) => (
              <button
                className={`project ${project.id === selected?.id ? "active" : ""}`}
                key={project.id}
                onClick={() => setSelectedId(project.id)}
              >
                <span className="avatar">{project.name.slice(0, 1)}</span>
                <span>
                  <b>{project.name}</b>
                  <small>{project.category}</small>
                </span>
                <StatusBadge status={project.status} />
              </button>
            ))}
          </div>

          <form className="new-project" onSubmit={createProject}>
            <span className="section-label">ADD SOURCE</span>
            <input
              placeholder="Project name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              placeholder="https://project.xyz/terms"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option>Terms</option>
              <option>Docs</option>
              <option>Roadmap</option>
              <option>Tokenomics</option>
              <option>Privacy</option>
              <option>Other</option>
            </select>
            <button className="button primary" disabled={busy}>
              Register project
            </button>
          </form>
        </aside>

        <section className="panel main-panel">
          <div className="tabs">
            <button
              className={tab === "overview" ? "active" : ""}
              onClick={() => setTab("overview")}
            >
              Overview
            </button>
            <button
              className={tab === "commitments" ? "active" : ""}
              onClick={() => setTab("commitments")}
            >
              Commitments
            </button>
            <button
              className={tab === "history" ? "active" : ""}
              onClick={() => setTab("history")}
            >
              Verification history
            </button>
          </div>

          {selected && tab === "overview" && (
            <div className="content">
              <div className="source-head">
                <div>
                  <span className="section-label">SELECTED SOURCE</span>
                  <h2>{selected.name}</h2>
                  <a href={selected.url} target="_blank" rel="noreferrer">
                    {selected.url}
                  </a>
                </div>
                <StatusBadge status={selected.status} />
              </div>

              <div className="score-box">
                <div
                  className="score-ring"
                  style={{ "--score": `${selected.score}%` } as React.CSSProperties}
                >
                  <strong>{selected.score}</strong>
                  <span>/100</span>
                </div>
                <div>
                  <span className="section-label">SEMANTIC STABILITY</span>
                  <p>{selected.summary}</p>
                </div>
              </div>

              <div className="actions">
                <button
                  className="button primary"
                  onClick={captureBaseline}
                  disabled={busy}
                >
                  Capture baseline
                </button>
                <button
                  className="button dark"
                  onClick={verifyProject}
                  disabled={busy}
                >
                  Verify current page
                </button>
              </div>

              <div className="notice">
                {notice ||
                  "Baseline → current page → semantic adjudication → on-chain verification record."}
              </div>
            </div>
          )}

          {tab === "commitments" && (
            <div className="content">
              <div className="source-head">
                <div>
                  <span className="section-label">COMMITMENT REGISTRY</span>
                  <h2>Public promises</h2>
                  <p>
                    Record a statement first. Verification later produces a
                    consensus-backed evidence status.
                  </p>
                </div>
              </div>

              <form className="commit-form" onSubmit={addCommitment}>
                <textarea
                  placeholder="Example: We will publish the public API documentation before the next major release."
                  value={statement}
                  onChange={(e) => setStatement(e.target.value)}
                />
                <input
                  placeholder="Deadline (optional)"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
                <button className="button primary" disabled={busy}>
                  Anchor commitment
                </button>
              </form>

              <div className="cards">
                {commitments
                  .filter((c) => !selected || c.projectId === selected.id)
                  .map((c) => (
                    <article className="commit-card" key={c.id}>
                      <div className="card-top">
                        <StatusBadge status={c.status} />
                        <span>{c.deadline || "No deadline"}</span>
                      </div>
                      <h3>{c.statement}</h3>
                      <p>{c.evidence || "No verification evidence yet."}</p>
                      <div className="card-bottom">
                        <b>{c.score}/100</b>
                        <button
                          className="button mini"
                          onClick={() => void verifyCommitment(c.id)}
                          disabled={busy}
                        >
                          Verify
                        </button>
                      </div>
                    </article>
                  ))}
              </div>
            </div>
          )}

          {tab === "history" && (
            <div className="content">
              <div className="source-head">
                <div>
                  <span className="section-label">AUDIT TRAIL</span>
                  <h2>Verification history</h2>
                  <p>
                    Every adjudication is recorded with a status, score and
                    evidence summary.
                  </p>
                </div>
              </div>

              <div className="timeline">
                {history
                  .filter((h) => !selected || h.projectId === selected.id)
                  .map((h) => (
                    <article key={h.id}>
                      <div className="timeline-dot"></div>
                      <div>
                        <div className="card-top">
                          <StatusBadge status={h.status} />
                          <span>{h.kind}</span>
                        </div>
                        <h3>{h.summary}</h3>
                        <p>{h.evidence}</p>
                        <strong>{h.score}/100</strong>
                      </div>
                    </article>
                  ))}
              </div>
            </div>
          )}
        </section>
      </section>

      <footer className="shell footer">
        <span>TermsGuard · GenLayer Intelligent Contract dApp</span>
        <span>Semantic decisions are consensus-backed, not ordinary website diffs.</span>
      </footer>
    </main>
  );
}
