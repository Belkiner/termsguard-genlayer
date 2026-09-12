import type { Metadata } from "next";
import Link from "next/link";
import styles from "./roadmap.module.css";

export const metadata: Metadata = {
  title: "Roadmap — TermsGuard",
  description: "Explore planned improvements to TermsGuard: reliable verification, clear evidence, watchlists, Telegram, scheduled checks and GitHub / DAO integrations.",
};

export default function RoadmapPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>TermsGuard<span>Verifiable public commitments</span></Link>
        <nav aria-label="Roadmap navigation"><Link href="/">Back to app</Link><a href="https://github.com/Belkiner/termsguard-genlayer/blob/main/ROADMAP.md">View on GitHub ↗</a></nav>
      </header>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>THE ROAD AHEAD</p>
        <h1>Know what changes.<br />See what comes next.</h1>
        <p>We are building a clearer way to follow public policies and project promises, with evidence you can inspect.</p>
        <div className={styles.note}><strong>Planned improvements, with clear acceptance criteria.</strong> Some underlying capabilities already exist. Each milestone is complete only after its published implementation has been verified. Priorities may change; no delivery dates are committed.</div>
        <p className={styles.updated}>Updated 12 September 2026 · Six planned milestones</p>
      </section>
      <ol className={styles.grid} aria-label="Planned milestones">
        <li className={styles.card}>
          <div className={styles.cardTop}><span className={styles.number}>01</span><span className={styles.status}>Planned</span></div>
          <h2>Reliable verification</h2>
          <p className={styles.goal}>Make every verification dependable, from submission to the final result.</p>
          <p>Correct transaction statuses and recovery by transaction hash; automatic result refresh; documentation aligned with the deployed product.</p>
          <div className={styles.acceptance}><strong>Ready when</strong><p>The complete verification flow passes acceptance tests without a manual page reload.</p></div>
        </li>
        <li className={styles.card}>
          <div className={styles.cardTop}><span className={styles.number}>02</span><span className={styles.status}>Planned</span></div>
          <h2>Clear results</h2>
          <p className={styles.goal}>Understand what changed and why it matters.</p>
          <p>Before-and-after comparisons; source quotations and verification time; separate explanations for policy scores and commitment outcomes.</p>
          <div className={styles.acceptance}><strong>Ready when</strong><p>A controlled page change produces an understandable report with supporting evidence.</p></div>
        </li>
        <li className={styles.card}>
          <div className={styles.cardTop}><span className={styles.number}>03</span><span className={styles.status}>Planned</span></div>
          <h2>Personal watchlist</h2>
          <p className={styles.goal}>Keep the projects you care about in one place.</p>
          <p>Saved projects; change history; unread results and clear last-checked timestamps.</p>
          <div className={styles.acceptance}><strong>Ready when</strong><p>Users can return to their saved projects and identify new results.</p></div>
        </li>
        <li className={styles.card}>
          <div className={styles.cardTop}><span className={styles.number}>04</span><span className={styles.status}>Planned</span></div>
          <h2>Telegram notifications</h2>
          <p className={styles.goal}>Receive useful updates without repeatedly opening the dashboard.</p>
          <p>Opt-in result notifications and verification reminders; links to reports; notification preferences and unsubscribe controls.</p>
          <div className={styles.acceptance}><strong>Ready when</strong><p>Subscribers receive relevant notifications with working report links and can unsubscribe.</p></div>
        </li>
        <li className={styles.card}>
          <div className={styles.cardTop}><span className={styles.number}>05</span><span className={styles.status}>Planned</span></div>
          <h2>Scheduled checks</h2>
          <p className={styles.goal}>Keep checks running at a frequency and cost you choose.</p>
          <p>A server-side scheduler; explicit execution funding and spending limits; retry handling for technical failures.</p>
          <div className={styles.acceptance}><strong>Ready when</strong><p>Checks run on the configured schedule within the selected budget, with visible failures.</p></div>
        </li>
        <li className={styles.card}>
          <div className={styles.cardTop}><span className={styles.number}>06</span><span className={styles.status}>Planned</span></div>
          <h2>GitHub and DAO evidence</h2>
          <p className={styles.goal}>Check public promises against more than one source.</p>
          <p>Evidence from GitHub releases and documentation; import of approved Snapshot proposals; source attribution per commitment.</p>
          <div className={styles.acceptance}><strong>Ready when</strong><p>A commitment can be assessed using multiple linked sources, distinguishing a decision from its implementation.</p></div>
        </li>
      </ol>
      <section className={styles.feedback}>
        <h2>Help shape the next step.</h2>
        <p>Tell us which projects you follow and which changes you need to know about.</p>
        <a href="https://github.com/Belkiner/termsguard-genlayer/issues">Share feedback on GitHub ↗</a>
      </section>
      <footer className={styles.footer}><span>Planned → In progress → In review → Complete</span><Link href="/">Return to TermsGuard</Link></footer>
    </main>
  );
}
