"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  isConfigured,
  contractAddress,
  transactionReader,
  executionFailed,
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

function hasUsableBaseline(project: Project) {
  try {
    const baseline = JSON.parse(project.baseline);
    return baseline.source_status === "OK" && Array.isArray(baseline.facts) && baseline.facts.length > 0;
  } catch { return false; }
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

  const stages = [
    { key: "PENDING", label: "Submitted" },
    { key: "PROPOSING", label: "Proposing" },
    { key: "COMMITTING", label: "Committing" },
    { key: "REVEALING", label: "Revealing" },
    { key: "ACCEPTED", label: "Accepted" },
    { key: "FINALIZED", label: "Finalized" },
  ];

  const stageIndex: Record<string, number> = {
    UNINITIALIZED: 0,
    PENDING: 0,
    PROPOSING: 1,
    COMMITTING: 2,
    REVEALING: 3,
    LEADER_REVEALING: 3,
    ACCEPTED: 4,
    READY_TO_FINALIZE: 4,
    FINALIZED: 5,
  };

  const index = stageIndex[tx.status] ?? 0;
  const pct = tx.status === "FINALIZED" ? 100 : Math.max(8, Math.min(96, ((index + 0.5) / 6) * 100));
  const explicitFailure =
    tx.receiptStatus === "contract_error" ||
    tx.execution.includes("ERROR") ||
    tx.execution.includes("FAILED") ||
    tx.execution.includes("REVERT") ||
    tx.execution.includes("TIMEOUT") ||
    tx.execution.includes("NONDET_DISAGREE") ||
    executionFailed(tx.execution) ||
    ["CANCELED", "UNDETERMINED", "VALIDATORS_TIMEOUT", "LEADER_TIMEOUT"].includes(tx.status);
  const completed = tx.status === "FINALIZED" && tx.success && !explicitFailure;

  const failed = explicitFailure || executionFailed(tx.execution);
  const unknownFinal = tx.status === "FINALIZED" && !completed && !failed;
  const title = unknownFinal ? "Finalized — execution unconfirmed" : completed
    ? "Transaction complete"
    : failed
      ? "Transaction needs attention"
      : "Transaction in progress";

  const subtitle = unknownFinal ? "Check the execution receipt before retrying." : completed
    ? "Consensus reached and the contract state has been accepted by the network."
    : failed
      ? "The transaction did not finish successfully."
      : stageLabel[tx.status] ?? "Waiting for the network…";

  return (
    <section className={`tx-panel ${completed ? "tx-complete" : ""} ${failed ? "tx-error" : ""}`} aria-live="polite">
      <div className="tx-head">
        <div className="tx-title-wrap">
          <div className={`tx-status-icon ${completed ? "done" : failed || unknownFinal ? "bad" : "working"}`}>
            {completed ? "✓" : failed || unknownFinal ? "!" : ""}
          </div>
          <div>
            <b>{title}</b>
            <span>{subtitle}</span>
          </div>
        </div>
        {!completed && !failed && !unknownFinal && <div className="tx-spinner" aria-label="transaction in progress" />}
      </div>

      <div className="tx-progress-row" aria-label="Transaction lifecycle stages, not elapsed-time percentage">
        <div className="tx-track">
          <div className="tx-fill" style={{ width: `${pct}%` }} />
        </div>
        <strong>{tx.status}</strong>
      </div>

      <div className="tx-steps">
        {stages.map((stage, i) => {
          const done = completed || i < index;
          const current = !completed && !failed && i === index;
          return (
            <div className={`tx-step ${done ? "done" : ""} ${current ? "current" : ""}`} key={stage.key}>
              <span>{done ? "✓" : i + 1}</span>
              <small>{stage.label}</small>
            </div>
          );
        })}
      </div>

      <div className="tx-meta">
        <span>{tx.resultName ? `Consensus: ${tx.resultName}` : "Consensus: waiting"}</span>
        <span>{tx.execution && tx.execution !== "UNKNOWN" ? `Execution: ${tx.execution}` : "Execution: waiting"}</span>
      </div>

      {failed && (
        <div className="tx-detail">
          {tx.receiptStatus === "contract_error"
            ? "The contract returned an execution error."
            : tx.status === "CANCELED"
              ? "The transaction was canceled."
              : tx.status === "UNDETERMINED"
                ? "Consensus could not be determined."
                : "The network did not confirm a successful transaction."}
        </div>
      )}

      <div className="tx-hash">
        <span>TX</span>
        <code title={tx.hash}>{tx.hash}</code>
        <button type="button" onClick={() => void navigator.clipboard.writeText(tx.hash)}>Copy TX</button>
        {networkName() === "studionet" && <a href={`https://explorer-studio.genlayer.com/tx/${tx.hash}`} target="_blank" rel="noreferrer">Explorer</a>}
      </div>
    </section>
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
  const [resumeHash, setResumeHash] = useState("");
  const [tx, setTx] = useState<TxProgress | null>(null);
  const refreshInFlight = useRef(false);
  const operationLock = useRef(false);
  const activeHash = useRef("");
  const savedTxKey = `termsguard:tx:${networkName()}:${contractAddress()}`;

  useEffect(() => {
    try { setResumeHash(localStorage.getItem(savedTxKey) ?? ""); } catch { /* Storage can be disabled. */ }
  }, [savedTxKey]);

  function rememberHash(hash: string) {
    setResumeHash(hash);
    try { localStorage.setItem(savedTxKey, hash); } catch { /* Monitoring still works. */ }
  }

  async function resumeTransaction() {
    const hash = resumeHash.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
      setNotice("Enter a valid transaction hash (0x and 64 hexadecimal characters).");
      return;
    }
    activeHash.current = hash;
    rememberHash(hash);
    setNotice("Checking the existing transaction. No wallet signature is needed.");
    const client = transactionReader();
    await waitForAccepted(client, hash, setTx, 60_000);
    const synced = await refresh(true);
    setNotice(synced ? "Successful execution confirmed. State synchronized." : "Successful execution confirmed; refresh failed. Use Refresh.");
    monitorFinality(client, hash);
  }


  async function runAction(action: () => Promise<void>) {
    if (operationLock.current) return;
    operationLock.current = true;
    setBusy(true);
    try { await action(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Operation failed."); }
    finally { operationLock.current = false; setBusy(false); }
  }

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
      alerts: items.filter((c) => ["BROKEN", "UNVERIFIABLE"].includes(c.status)).length +
        (selected && ["HIGH", "CRITICAL", "UNVERIFIABLE"].includes(selected.status) ? 1 : 0),
      score: selected?.score ?? 0,
    };
  }, [projects, commitments, selected]);

  useEffect(() => {
    const provider = window.ethereum;
    const accountChanged = (accounts: string[]) => setWallet(accounts?.[0] ?? "");
    const chainChanged = () => { setNotice("Wallet network changed. It will be checked before the next write."); };
    void provider?.request({method:"eth_accounts"}).then(accountChanged).catch(() => {});
    provider?.on?.("accountsChanged", accountChanged);
    provider?.on?.("chainChanged", chainChanged);
    return () => { provider?.removeListener?.("accountsChanged", accountChanged); provider?.removeListener?.("chainChanged", chainChanged); };
  }, []);

  useEffect(() => {
    if (live) void refresh(true);
  }, [live]);

  async function refresh(silent = false): Promise<boolean> {
    if (!live) {
      if (!silent) setNotice("Contract is not configured.");
      return false;
    }
    if (refreshInFlight.current) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return refresh(silent);
    }

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
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not read contract state.");
      return false;
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

  function monitorFinality(client: any, hash: string) {
      const updateOwnTx = (progress: TxProgress) => {
        setTx((current) => current?.hash === hash ? progress : current);
      };
      void watchFinalized(client, hash, updateOwnTx)
        .then(async (final) => {
          updateOwnTx(final);
          if (activeHash.current !== hash) return;
          if (final.status === "FINALIZED") {
            if (final.success && !executionFailed(final.execution) && final.receiptStatus !== "contract_error") {
              const synced = await refresh(true);
              if (activeHash.current === hash) setNotice(synced
                ? "Transaction finalized. State synchronized."
                : "Transaction finalized; state refresh failed. Use Refresh.");
            } else {
              setNotice("Transaction finalized without confirmed successful execution. Inspect TX before retrying.");
            }
          } else if (["CANCELED", "UNDETERMINED", "VALIDATORS_TIMEOUT", "LEADER_TIMEOUT"].includes(final.status)) {
            setNotice(`Transaction ended with ${final.status}.`);
          } else {
            setNotice("Finality monitoring paused. Keep the TX hash and resume checking; do not resubmit automatically.");
          }
        })
        .catch((error) => {
          if (activeHash.current === hash) setNotice(error instanceof Error ? error.message : "Transaction monitoring failed.");
        });

  }

  async function execute(
    functionName: string,
    args: any[],
    stateCheck?: () => Promise<boolean>,
  ) {
    try {
      const { hash, client } = await writeContract(functionName, args);
      activeHash.current = hash;
      rememberHash(hash);
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

      monitorFinality(client, hash);

      return accepted;
    } catch (error) {
      // Preserve the last observed receipt when polling or state refresh fails.
      throw error;
    }
  }

  async function protectWebsite() {
    const target = url.trim();
    try {
      const parsed = new URL(target);
      if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password || target.length > 300) throw new Error();
    } catch {
      setNotice("Enter a valid public HTTP(S) URL, without credentials, up to 300 characters.");
      return;
    }
    if (!window.ethereum) { setNotice("Connect a compatible browser wallet to continue."); return; }

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
        const existingProject = toProject(await readContract("get_project", [existing]), existing);
        if (!hasUsableBaseline(existingProject)) {
          setNotice("This project needs baseline capture before verification. Use Capture baseline.");
          return;
        }
        setNotice("Existing baseline found. Running verification now.");
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

      const captured = toProject(await readContract("get_project", [projectId]), projectId);
      if (!hasUsableBaseline(captured)) throw new Error("Capture returned an unusable baseline. Inspect source and retry capture.");
      // Automatically run the actual verification after baseline creation.
      await verifyProjectById(projectId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Protection failed.");
    }
  }

  async function verifyProjectById(projectId: number) {
    try {
      const project = toProject(await readContract("get_project", [projectId]), projectId);
      if (!hasUsableBaseline(project)) throw new Error("Capture a usable baseline before verification.");
      const before = Number(await readContract("get_verification_count"));

      await execute("verify_project", [projectId], async () => {
        const count = Number(await readContract("get_verification_count"));
        for (let id = before; id < count; id++) {
          const row = toVerification(await readContract("get_verification", [id]), id);
          if (row.projectId === projectId && row.kind === "POLICY") return true;
        }
        return false;
      });

      await refresh(true);
      setNotice("Verification accepted. Up to six commitments were checked; finality is monitored separately.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Verification failed.");
    }
  }

  async function captureSelected() {
    if (!selected) return;
    await execute("auto_capture", [selected.id], async () => hasUsableBaseline(toProject(await readContract("get_project", [selected.id]), selected.id)));
    await refresh(true);
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
            <a href="/roadmap" style={{color:"inherit",fontSize:14,textUnderlineOffset:4}}>Roadmap</a>
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
            <label htmlFor="website-url">Website URL</label>
            <input
              id="website-url"
              type="url"
              maxLength={300}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://project.com"
              disabled={busy}
            />
            <div className="protect-row">
              <input
                aria-label="Project name"
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Project name (optional)"
                disabled={busy}
              />
              <select aria-label="Page category" value={category} onChange={(e) => setCategory(e.target.value)} disabled={busy}>
                <option>Terms</option>
                <option>Roadmap</option>
                <option>Docs</option>
                <option>Tokenomics</option>
                <option>Governance</option>
                <option>Other</option>
              </select>
            </div>
            <button className="button primary" onClick={() => void runAction(protectWebsite)} disabled={busy || !live}>
              {busy ? "Working…" : "Protect website"}
            </button>
            <small>Baseline, discovery and verification are handled automatically. GenLayer may request more than one wallet confirmation because each state-changing transaction is signed separately.</small>
          </div>
        </section>

        {busy && <p role="status">Processing your request. Check your wallet if a signature is requested.</p>}
        <TxPanel tx={tx} />
        <section className="panel" aria-label="Check an existing transaction" style={{marginBottom:16}}>
          <label htmlFor="resume-hash">Check an existing transaction</label>
          <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:10}}>
            <input id="resume-hash" aria-label="Transaction hash" placeholder="0x… transaction hash"
              value={resumeHash} onChange={(event) => setResumeHash(event.target.value)}
              disabled={busy} style={{flex:"1 1 260px",minWidth:0}} />
            <button className="button ghost" disabled={busy || !live || !resumeHash.trim()}
              onClick={() => void runAction(resumeTransaction)}>Check status</button>
          </div>
          <small>Reads the existing transaction without sending it again or requesting a wallet signature.</small>
        </section>

        {notice && <div className="notice" role="status">{notice}</div>}

        <section className="stats-grid">
          <div><span>Monitored</span><b>{stats.monitored}</b></div>
          <div><span>Commitments</span><b>{stats.commitments}</b></div>
          <div><span>Fulfilled</span><b>{stats.fulfilled}</b></div>
          <div><span>Alerts</span><b>{stats.alerts}</b></div>
          <div><span>Policy score (model estimate)</span><b>{selected && !["PENDING", "CAPTURING", "BASELINED"].includes(selected.status) ? `${selected.score}/100` : "—"}</b></div>
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
              <button className="button primary" onClick={() => void runAction(verifySelected)} disabled={!selected || busy || !hasUsableBaseline(selected)}>
                Verify again
              </button>
            </div>

            {selected ? (
              <>
                {!hasUsableBaseline(selected) && <button className="button ghost" disabled={busy} onClick={() => void runAction(captureSelected)}>Capture baseline</button>}
                <details><summary>Inspect baseline</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{selected.baseline || "No baseline captured."}</pre></details>
                <div className="score">
                  <div className="score-number">{["PENDING", "CAPTURING", "BASELINED"].includes(selected.status) ? "—" : selected.score}</div>
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
              {history.filter((item) => !selected || item.projectId === selected.id).slice(0, 12).map((item) => (
                <div className="history-row" key={item.id}>
                  <span className={`status ${badge(item.status)}`}>{item.status}</span>
                  <span>{item.kind}</span>
                  <span className="history-summary">{item.summary}<details><summary>Evidence — project #{item.projectId}</summary>{item.evidence || "No evidence stored."}</details></span>
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

          <form className="manual-form" onSubmit={(e) => { e.preventDefault(); void runAction(() => addManualCommitment(e)); }}>
            <input
              aria-label="Commitment statement"
              maxLength={600}
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder="Optional commitment statement"
              disabled={!selected || busy}
            />
            <input
              aria-label="Commitment deadline"
              type="date"
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
        input,select { width:100%; box-sizing:border-box; border:1px solid rgba(255,255,255,.12); background:#fff; color:var(--ink); border-radius:12px; padding:13px 14px; outline:none; }
        .protect-row,.manual-form { display:grid; grid-template-columns:1fr 170px; gap:10px; margin-top:10px; }
        .button { border:1px solid rgba(255,255,255,.12); border-radius:12px; padding:12px 15px; cursor:pointer; font-weight:650; background:transparent; color:inherit; }
        .button.primary { margin-top:0; background:var(--ink); color:#fff; }
        .protect-card .button.primary { width:100%; margin-top:12px; }
        .button.ghost { background:rgba(255,255,255,.04); }
        .button:disabled { opacity:.45; cursor:not-allowed; }
        .protect-card small { display:block; margin-top:10px; font-size:11px; opacity:.55; line-height:1.5; }
        .tx-panel { margin:10px 0 16px; padding:22px 24px; }
        .tx-panel.tx-complete { border-color:rgba(121,226,167,.35); }
        .tx-panel.tx-error { border-color:rgba(255,123,134,.4); }
        .tx-head { display:flex; justify-content:space-between; align-items:center; gap:16px; }
        .tx-title-wrap { display:flex; align-items:center; gap:13px; }
        .tx-head b,.tx-head span { display:block; }
        .tx-head span { margin-top:4px; opacity:.62; font-size:12px; }
        .tx-status-icon { width:34px; height:34px; border-radius:50%; display:grid; place-items:center; border:1px solid rgba(255,255,255,.16); font-weight:800; }
        .tx-status-icon.working { border-color:rgba(255,255,255,.18); position:relative; }
        .tx-status-icon.working:after { content:""; width:14px; height:14px; border:2px solid rgba(255,255,255,.2); border-top-color:currentColor; border-radius:50%; animation:spin .8s linear infinite; }
        .tx-status-icon.done { color:#79e2a7; border-color:rgba(121,226,167,.4); }
        .tx-status-icon.bad { color:#ff7b86; border-color:rgba(255,123,134,.4); }
        .tx-spinner { width:22px; height:22px; border-radius:50%; border:2px solid rgba(255,255,255,.18); border-top-color:currentColor; animation:spin .8s linear infinite; }
        .tx-progress-row { display:grid; grid-template-columns:1fr auto; gap:12px; align-items:center; margin:20px 0 12px; }
        .tx-progress-row > strong { font-size:12px; min-width:38px; text-align:right; }
        .tx-track { height:8px; border-radius:99px; background:rgba(255,255,255,.08); overflow:hidden; }
        .tx-fill { height:100%; border-radius:inherit; background:currentColor; transition:width .5s ease; }
        .tx-steps { display:grid; grid-template-columns:repeat(6,1fr); gap:7px; }
        .tx-step { min-width:0; display:grid; justify-items:center; gap:6px; text-align:center; opacity:.38; }
        .tx-step span { width:24px; height:24px; border-radius:50%; display:grid; place-items:center; border:1px solid rgba(255,255,255,.12); font-size:10px; }
        .tx-step small { font-size:9px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
        .tx-step.done,.tx-step.current { opacity:1; }
        .tx-step.done span { background:rgba(121,226,167,.12); border-color:rgba(121,226,167,.45); color:#79e2a7; }
        .tx-step.current span { border-color:currentColor; box-shadow:0 0 0 3px rgba(255,255,255,.05); }
        .tx-meta { display:flex; justify-content:space-between; gap:12px; margin-top:14px; font-size:10px; opacity:.58; }
        .tx-hash { display:flex; justify-content:space-between; gap:10px; margin-top:9px; padding-top:10px; border-top:1px solid rgba(255,255,255,.07); font-size:10px; opacity:.52; }
        .tx-hash code { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .tx-detail { margin-top:12px; padding:10px 12px; border-radius:10px; background:rgba(255,123,134,.07); font-size:12px; opacity:.82; }
        .notice { margin-bottom:16px; font-size:13px; line-height:1.5; background:#151515; color:#fff; max-width:min(520px,calc(100vw - 44px)); }
        .stats-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:10px; margin-bottom:16px; }
        .stats-grid > div { padding:18px; border:1px solid rgba(255,255,255,.08); border-radius:16px; background:rgba(255,255,255,.025); }
        .stats-grid span { display:block; font-size:11px; opacity:.55; }
        .stats-grid b { display:block; margin-top:7px; font-size:24px; }
        .content-grid { display:grid; grid-template-columns:.9fr 1.1fr; gap:16px; }
        .panel { min-width:0; }
        .panel-head { display:flex; justify-content:space-between; gap:18px; align-items:center; margin-bottom:18px; }
        .panel-head h2 { margin:0; font-size:22px; letter-spacing:-.02em; }
        .project-list { display:grid; gap:7px; }
        .project-row { width:100%; display:grid; grid-template-columns:10px minmax(0,1fr) auto; gap:12px; align-items:center; text-align:left; color:inherit; background:transparent; border:1px solid transparent; border-radius:14px; padding:13px; cursor:pointer; }
        .project-row:hover,.project-row.selected { background:rgba(255,255,255,.045); border-color:rgba(255,255,255,.08); }
        .project-dot { width:8px; height:8px; border-radius:50%; background:currentColor; }
        .project-main { min-width:0; }
        .project-main b,.project-main small { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .project-main small { margin-top:4px; opacity:.5; font-size:11px; }
        .status { font-size:10px; letter-spacing:.08em; padding:5px 8px; border-radius:999px; border:1px solid currentColor; opacity:.9; }
        .status.good { color:#17613e; background:#e8f6ef; opacity:1; }
        .status.warn { color:#765000; background:#fff6df; opacity:1; }
        .status.bad { color:#a12424; background:#fdecec; opacity:1; }
        .status.muted { color:#555; opacity:1; }
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
        .history-summary { color:var(--muted); white-space:normal; overflow-wrap:anywhere; }
        .empty { padding:28px 10px; text-align:center; opacity:.5; font-size:13px; }
        .manual-form { grid-template-columns:1fr 170px 100px; margin:0; }
        @media (prefers-reduced-motion:reduce) { .tx-status-icon.working:after,.tx-spinner { animation:none; } }
        @media (max-width:620px) { .topbar {height:auto; min-height:76px; flex-wrap:wrap; gap:12px; padding:12px;} .top-actions {flex-wrap:wrap;} .panel-head {flex-wrap:wrap;} }
        @keyframes spin { to { transform:rotate(360deg); } }
        @media (max-width:850px) {
          .hero,.content-grid { grid-template-columns:1fr; }
          .stats-grid { grid-template-columns:repeat(2,1fr); }
          .manual-form,.protect-row { grid-template-columns:1fr; }
          .history-row { grid-template-columns:1fr 1fr; }
          .tx-steps { grid-template-columns:repeat(3,1fr); }
          .tx-meta { flex-direction:column; gap:5px; }
        }
      `}</style>
    </>
  );
}

