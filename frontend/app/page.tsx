"use client";

import { useMemo, useState } from "react";
import StatusBadge from "../components/StatusBadge";
import StatCard from "../components/StatCard";
import { demoCommitments, demoHistory, demoProjects } from "../lib/demo";
import { isLive, readContract, waitFinalized, writeContract } from "../lib/genlayer";
import type { Commitment, Project, Verification } from "../lib/types";

function projectFromRaw(raw: any, id: number): Project {
  const a = Array.isArray(raw) ? raw : [];
  return {
    id,
    name: a[0] ?? `Project ${id}`,
    url: a[1] ?? "",
    category: a[2] ?? "Other",
    baseline: a[3] ?? "",
    status: a[4] ?? "UNKNOWN",
    score: Number(a[5] ?? 0),
    summary: a[6] ?? "No summary available.",
  };
}

function commitmentFromRaw(raw: any, id: number): Commitment {
  const a = Array.isArray(raw) ? raw : [];
  return {
    id,
    projectId: Number(a[0] ?? 0),
    statement: a[1] ?? "",
    deadline: a[2] ?? "",
    status: a[3] ?? "UNKNOWN",
    score: Number(a[4] ?? 0),
    evidence: a[5] ?? "",
  };
}

function verificationFromRaw(raw: any, id: number): Verification {
  const a = Array.isArray(raw) ? raw : [];
  return {
    id,
    projectId: Number(a[0] ?? 0),
    kind: a[1] ?? "",
    itemId: Number(a[2] ?? 0),
    status: a[3] ?? "UNKNOWN",
    score: Number(a[4] ?? 0),
    summary: a[5] ?? "",
    evidence: a[6] ?? "",
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

  const selected = projects.find((p) => p.id === selectedId) ?? projects[0];
  const live = isLive();

  const stats = useMemo(() => ({
    monitored: projects.length,
    commitments: commitments.length,
    critical: projects.filter((p) => p.status === "CRITICAL").length,
    fulfilled: commitments.filter((c) => c.status === "FULFILLED").length,
    average: projects.length ? Math.round(projects.reduce((sum, p) => sum + p.score, 0) / projects.length) : 0,
  }), [projects, commitments]);

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

  async function refresh() {
    if (!live) {
      setNotice("Demo Mode is using local sample data.");
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
      for (let i = 0; i < Math.min(projectCount, 100); i++) nextProjects.push(projectFromRaw(await readContract("get_project", [i]), i));
      for (let i = 0; i < Math.min(commitmentCount, 200); i++) nextCommitments.push(commitmentFromRaw(await readContract("get_commitment", [i]), i));
      for (let i = 0; i < Math.min(verificationCount, 200); i++) nextHistory.push(verificationFromRaw(await readContract("get_verification", [i]), i));
      setProjects(nextProjects);
      setCommitments(nextCommitments);
      setHistory(nextHistory.reverse());
      if (nextProjects[0]) setSelectedId(nextProjects[0].id);
      setNotice("Synced with GenLayer.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not sync contract.");
    } finally {
      setBusy(false);
    }
  }

  async function createProject(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !url.trim()) return setNotice("Project name and URL are required.");
    if (!live) {
      const p: Project = { id: Date.now(), name, url, category, baseline: "", status: "PENDING", score: 0, summary: "Created locally. Deploy the contract to persist it on-chain." };
      setProjects((items) => [p, ...items]);
      setSelectedId(p.id);
      setName(""); setUrl("");
      return setNotice("Project created in Demo Mode.");
    }
    setBusy(true);
    try {
      const { hash, client } = await writeContract("create_project", [name, url, category]);
      await waitFinalized(client, hash);
      setName(""); setUrl("");
      setNotice("Project registered on GenLayer.");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Project creation failed.");
    } finally { setBusy(false); }
  }

  async function captureBaseline() {
    if (!selected) return;
    if (!live) return setNotice("Deploy the contract to capture an on-chain baseline.");
    setBusy(true);
    try {
      const { hash, client } = await writeContract("capture_baseline", [selected.id]);
      await waitFinalized(client, hash);
      setNotice("Baseline captured with GenLayer consensus.");
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Baseline capture failed."); }
    finally { setBusy(false); }
  }

  async function verifyProject() {
    if (!selected) return;
    if (!live) {
      const updated = { ...selected, status: "NO_CHANGE", score: 97, summary: "Demo consensus: no material policy change detected." };
      setProjects((items) => items.map((p) => p.id === selected.id ? updated : p));
      setHistory((items) => [{ id: Date.now(), projectId: selected.id, kind: "POLICY", itemId: selected.id, status: "NO_CHANGE", score: 97, summary: updated.summary, evidence: "Demo evidence: fees, access and governance remain materially equivalent." }, ...items]);
      return setNotice("Demo verification completed.");
    }
    setBusy(true);
    try {
      const { hash, client } = await writeContract("verify_project", [selected.id]);
      await waitFinalized(client, hash);
      setNotice("Policy verification finalized.");
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Verification failed."); }
    finally { setBusy(false); }
  }

  async function addCommitment(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !statement.trim()) return setNotice("Choose a project and enter a commitment.");
    if (!live) {
      const item: Commitment = { id: Date.now(), projectId: selected.id, statement, deadline, status: "OPEN", score: 0, evidence: "Awaiting live GenLayer verification." };
      setCommitments((items) => [item, ...items]); setStatement(""); setDeadline("");
      return setNotice("Commitment created in Demo Mode.");
    }
    setBusy(true);
    try {
      const { hash, client } = await writeContract("add_commitment", [selected.id, statement, deadline]);
      await waitFinalized(client, hash);
      setStatement(""); setDeadline("");
      setNotice("Commitment anchored on GenLayer.");
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Commitment creation failed."); }
    finally { setBusy(false); }
  }

  async function verifyCommitment(id: number) {
    if (!live) {
      setCommitments((items) => items.map((c) => c.id === id ? { ...c, status: "FULFILLED", score: 93, evidence: "Demo evidence supports completion." } : c));
      return setNotice("Demo commitment verification completed.");
    }
    setBusy(true);
    try {
      const { hash, client } = await writeContract("verify_commitment", [id]);
      await waitFinalized(client, hash);
      setNotice("Commitment verification finalized.");
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Commitment verification failed."); }
    finally { setBusy(false); }
  }

  return (
    <main>
      <header className="nav shell">
        <div className="brand"><div className="brand-mark">T</div><div><strong>TermsGuard</strong><small>semantic verification layer</small></div></div>
        <div className="nav-right"><span className={live ? "network live" : "network"}>{live ? "GENLAYER LIVE" : "DEMO MODE"}</span><button className="button ghost" onClick={connectWallet}>{wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : "Connect wallet"}</button></div>
      </header>

      <section className="hero shell">
        <div className="hero-copy"><span className="eyebrow">PUBLIC COMMITMENTS · POLICY · EVIDENCE</span><h1>Turn promises into<br /><em>verifiable history.</em></h1><p>TermsGuard registers public project commitments and policies, then uses GenLayer to adjudicate whether the evidence still supports them.</p><div className="hero-actions"><button className="button primary" onClick={() => setTab("commitments")}>Create commitment</button><button className="button ghost" onClick={refresh} disabled={busy}>Sync network</button></div></div>
        <div className="hero-card"><div className="pulse"></div><span>CONSENSUS LAYER</span><strong>{stats.fulfilled}/{stats.commitments || 0}</strong><small>commitments fulfilled</small></div>
      </section>

      <section className="shell stats"><StatCard label="Monitored" value={stats.monitored} hint="public sources" /><StatCard label="Commitments" value={stats.commitments} hint="anchored statements" /><StatCard label="Fulfilled" value={stats.fulfilled} hint="evidence-supported" /><StatCard label="Stability" value={`${stats.average}/100`} hint="semantic score" /></section>

      <section className="shell layout">
        <aside className="sidebar panel"><div className="panel-title"><div><span>REGISTRY</span><h2>Projects</h2></div><button className="icon-button" onClick={refresh}>↻</button></div><div className="project-list">{projects.map((project) => <button className={`project ${project.id === selected?.id ? "active" : ""}`} key={project.id} onClick={() => setSelectedId(project.id)}><span className="avatar">{project.name.slice(0, 1)}</span><span><b>{project.name}</b><small>{project.category}</small></span><StatusBadge status={project.status} /></button>)}</div><form className="new-project" onSubmit={createProject}><span className="section-label">ADD SOURCE</span><input placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} /><input placeholder="https://project.xyz/terms" value={url} onChange={(e) => setUrl(e.target.value)} /><select value={category} onChange={(e) => setCategory(e.target.value)}><option>Terms</option><option>Docs</option><option>Roadmap</option><option>Tokenomics</option><option>Privacy</option><option>Other</option></select><button className="button primary" disabled={busy}>Register project</button></form></aside>

        <section className="panel main-panel">
          <div className="tabs"><button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>Overview</button><button className={tab === "commitments" ? "active" : ""} onClick={() => setTab("commitments")}>Commitments</button><button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>Verification history</button></div>

          {selected && tab === "overview" && <div className="content"><div className="source-head"><div><span className="section-label">SELECTED SOURCE</span><h2>{selected.name}</h2><a href={selected.url} target="_blank" rel="noreferrer">{selected.url}</a></div><StatusBadge status={selected.status} /></div><div className="score-box"><div className="score-ring" style={{ "--score": `${selected.score}%` } as React.CSSProperties}><strong>{selected.score}</strong><span>/100</span></div><div><span className="section-label">SEMANTIC STABILITY</span><p>{selected.summary}</p></div></div><div className="actions"><button className="button primary" onClick={captureBaseline} disabled={busy}>Capture baseline</button><button className="button dark" onClick={verifyProject} disabled={busy}>Verify current page</button></div><div className="notice">{notice || "Baseline → current page → semantic adjudication → on-chain verification record."}</div></div>}

          {tab === "commitments" && <div className="content"><div className="source-head"><div><span className="section-label">COMMITMENT REGISTRY</span><h2>Public promises</h2><p>Record a statement first. Verification later produces a consensus-backed evidence status.</p></div></div><form className="commit-form" onSubmit={addCommitment}><textarea placeholder="Example: We will publish the public API documentation before the next major release." value={statement} onChange={(e) => setStatement(e.target.value)} /><input placeholder="Deadline (optional)" value={deadline} onChange={(e) => setDeadline(e.target.value)} /><button className="button primary" disabled={busy}>Anchor commitment</button></form><div className="cards">{commitments.filter((c) => !selected || c.projectId === selected.id).map((c) => <article className="commit-card" key={c.id}><div className="card-top"><StatusBadge status={c.status} /><span>{c.deadline || "No deadline"}</span></div><h3>{c.statement}</h3><p>{c.evidence || "No verification evidence yet."}</p><div className="card-bottom"><b>{c.score}/100</b><button className="button mini" onClick={() => verifyCommitment(c.id)} disabled={busy}>Verify</button></div></article>)}</div></div>}

          {tab === "history" && <div className="content"><div className="source-head"><div><span className="section-label">AUDIT TRAIL</span><h2>Verification history</h2><p>Every adjudication is recorded with a status, score and evidence summary.</p></div></div><div className="timeline">{history.filter((h) => !selected || h.projectId === selected.id).map((h) => <article key={h.id}><div className="timeline-dot"></div><div><div className="card-top"><StatusBadge status={h.status} /><span>{h.kind}</span></div><h3>{h.summary}</h3><p>{h.evidence}</p><strong>{h.score}/100</strong></div></article>)}</div></div>}
        </section>
      </section>

      <footer className="shell footer"><span>TermsGuard · GenLayer Intelligent Contract dApp</span><span>Semantic decisions are consensus-backed, not ordinary website diffs.</span></footer>
    </main>
  );
}
