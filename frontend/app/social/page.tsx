"use client";
import {useEffect,useRef,useState} from "react";
import {postId,type XPost} from "../../lib/x-post";
import {socialAddress,socialConfigured,socialRead,socialWrite} from "../../lib/social";
import {getTransactionProgress,transactionReader,networkName} from "../../lib/genlayer";
import type {TxProgress} from "../../lib/types";
import styles from "./social.module.css";

type Event = {id:number;record_id:number;status:string;summary:string;quotes:string[];evidence_url:string;checked_at:string};
type PromiseRecord = {id:number;owner:string;post_id:string;quote_sha256:string;snapshot_sha256:string;start:number;length:number;deadline:string;status:string;latest:Event|null};
const terminal = new Set(["FINALIZED","CANCELED","UNDETERMINED","VALIDATORS_TIMEOUT","LEADER_TIMEOUT"]);
export default function SocialPage() {
  const [url,setUrl]=useState(""); const [post,setPost]=useState<XPost|null>(null);
  const [quote,setQuote]=useState(""); const [deadline,setDeadline]=useState("");
  const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  const [hash,setHash]=useState(""); const [progress,setProgress]=useState<TxProgress|null>(null);
  const [polling,setPolling]=useState(false); const [records,setRecords]=useState<PromiseRecord[]>([]);
  const [offset,setOffset]=useState(0); const [total,setTotal]=useState(0);
  const [selected,setSelected]=useState(""); const [evidence,setEvidence]=useState("");
  const [account,setAccount]=useState(""); const [compatible,setCompatible]=useState(false);
  const [excerpt,setExcerpt]=useState<{id:number;text:string}|null>(null);
  const [history,setHistory]=useState<Event[]>([]); const [historyOffset,setHistoryOffset]=useState(0); const [historyTotal,setHistoryTotal]=useState(0);
  const mounted=useRef(true);
  const key=`termsguard:social:${networkName()}:${socialAddress}:tx`;
  async function refresh() {
    if (!socialConfigured) return;
    const config=await socialRead("get_config") as {version:string};
    if (config.version!=="social-1") throw new Error("The configured address is not a compatible social contract.");
    const data=await socialRead("get_records",[offset,10]) as {items:PromiseRecord[];total:number};
    const events=await socialRead("get_history",[historyOffset,10]) as {items:Event[];total:number};
    if (mounted.current) {setCompatible(true);setRecords(data.items);setTotal(data.total);setHistory(events.items);setHistoryTotal(events.total);}
  }
  useEffect(()=>{mounted.current=true;try{setHash(localStorage.getItem(key)||"");}catch{}
    const changed=(a:string[])=>setAccount(a?.[0]||"");
    window.ethereum?.request({method:"eth_accounts"}).then(changed).catch(()=>{});
    window.ethereum?.on?.("accountsChanged",changed);
    return()=>{mounted.current=false;window.ethereum?.removeListener?.("accountsChanged",changed);};
  },[key]);
  useEffect(()=>{refresh().catch(e=>setError(String(e.message||e)));},[offset,historyOffset]);
  useEffect(()=>{if(!post)return;const timer=setTimeout(()=>setPost(null),300000);return()=>clearTimeout(timer);},[post]);
  useEffect(()=>{if(!excerpt)return;const timer=setTimeout(()=>setExcerpt(null),300000);return()=>clearTimeout(timer);},[excerpt]);
  useEffect(()=>{
    if (!polling || !hash) return;
    let active=true;let timer:ReturnType<typeof setTimeout>;const started=Date.now();
    const tick=async()=>{
      try {
        const p=await getTransactionProgress(transactionReader(),hash);
        if (!active) return;
        setProgress(p);
        if(p.success) await refresh();
        if(terminal.has(p.status)) {
          setPolling(false);
          if(!p.success) setError("Transaction ended without confirmed successful execution. Check this hash; do not automatically resubmit.");
          return;
        }
        if(Date.now()-started>30*60_000){setPolling(false);setError("Checking paused after 30 minutes. Resume checking the saved hash.");return;}
        timer=setTimeout(tick,5000);
      }catch(e){if(active){setPolling(false);setError(`Checking paused: ${e instanceof Error?e.message:String(e)}. Your transaction hash is saved.`);}}
    };
    tick();return()=>{active=false;clearTimeout(timer);};
  },[polling,hash,offset,historyOffset]);
  async function importPost(){setBusy(true);setError("");setPost(null);setQuote("");setDeadline("");try{
    const id=postId(url);const r=await fetch(`/api/social/posts/${id}`);const data=await r.json();
    if(!r.ok)throw new Error(data.error||"Post import failed.");setPost(data);
  }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  async function inspect(r:PromiseRecord){setBusy(true);setError("");setExcerpt(null);try{
    const response=await fetch(`/api/social/posts/${r.post_id}`);const p=await response.json();if(!response.ok)throw new Error(p.error||"Source unavailable.");
    const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(p.text));
    const hash=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
    if(hash!==r.snapshot_sha256)throw new Error("This post changed since capture. Its current text is not the original promise.");
    setExcerpt({id:r.id,text:Array.from(p.text as string).slice(r.start,r.start+r.length).join("")});
  }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  async function send(name:string,args:(string|number)[]){setBusy(true);setError("");try{
    const h=await socialWrite(name,args);setProgress(null);setHash(h);try{localStorage.setItem(key,h);}catch{}
    const a=await window.ethereum?.request({method:"eth_accounts"});setAccount(a?.[0]||"");setPolling(true);
  }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  const chosen=records.find(r=>String(r.id)===selected);
  const unresolved=!!hash && (!progress || !terminal.has(progress.status));
  const blocked=busy||polling||unresolved||!compatible;
  return <main className={styles.page}>
    <nav className={styles.nav}><a href="/">← TermsGuard</a><a href="/roadmap">Roadmap</a></nav>
    <p>X PROMISES · BETA</p><h1>Follow a promise.<br/>Check the evidence.</h1>
    <p className={styles.intro}>Save an exact promise from a public X post, then assess its fulfillment against a separate public evidence page. Each saved promise and verification belongs to the new social contract.</p>
    <p className={styles.note}>Text only: attached media, quoted posts and threads are not imported. X content comes through the TermsGuard server using the official API. Consensus evaluates that supplied source; it does not independently authenticate X or prove a website’s claims.</p>
    {!socialConfigured&&<p className={styles.status}>Preview: on-chain saving is not activated. The operator must deploy and configure the separate social contract.</p>}
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    <section className={styles.card}><h2>1. Import a post</h2>
      <label htmlFor="post-url">Public X post URL</label><input id="post-url" type="url" value={url} onChange={e=>{setUrl(e.target.value);setPost(null);}} placeholder="https://x.com/author/status/123…"/>
      <button disabled={busy||!url.trim()} onClick={importPost}>{busy?"Working…":"Load post"}</button>
      {post&&<><p><a href={post.url} target="_blank" rel="noreferrer">@{post.username} · View original post</a></p><blockquote>{post.text}</blockquote>
      <label htmlFor="quote">Copy the exact promise excerpt</label><textarea id="quote" maxLength={1000} value={quote} onChange={e=>setQuote(e.target.value)}/>
      <label htmlFor="deadline">Deadline explicitly stated in the post (optional)</label><input id="deadline" type="date" value={deadline} onChange={e=>setDeadline(e.target.value)}/>
      <p className={styles.note}>The post ID, excerpt position, deadline and hashes are stored publicly. The X text is fetched when needed, rather than archived on-chain. Changed or unavailable originals cannot be verified. Your wallet records the promise; it does not prove you own the X account.</p>
      <button disabled={blocked||!quote.trim()||!post.text.includes(quote.trim())} onClick={()=>{const start=post.text.indexOf(quote.trim());send("capture_promise",[post.id,Array.from(post.text.slice(0,start)).length,Array.from(quote.trim()).length,deadline]);}}>Save promise with wallet</button></>}
    </section>
    {hash&&<section className={styles.card}><h2>Transaction</h2><div className={styles.status} role="status" aria-live="polite">{progress?`${progress.status} · ${progress.success?"execution confirmed":"execution not yet confirmed"}`:"Saved transaction — check its status before another submission."}<br/>{hash}{polling&&<p>Checking network status…</p>}</div>
      <button disabled={polling||busy} onClick={()=>{setError("");setPolling(true);}}>Resume checking</button>
      {progress&&terminal.has(progress.status)&&<button disabled={busy} onClick={()=>{setHash("");setProgress(null);try{localStorage.removeItem(key);}catch{}}}>Start another action</button>}
      <p className={styles.note}>ACCEPTED is provisional. FINALIZED is finality; execution must also succeed. Checking never resubmits a transaction.</p></section>}
    <section className={styles.card}><h2>2. Saved promises</h2><button disabled={busy||!socialConfigured} onClick={()=>refresh().catch(e=>setError(String(e.message||e)))}>Refresh</button>
      {!records.length&&<p className={styles.note}>No records loaded. This list shows public records from the social contract.</p>}
      {records.map(r=><article className={styles.row} key={r.id}><span className={styles.badge}>{r.status}</span><h3>Promise #{r.id} · <a href={`https://x.com/i/web/status/${r.post_id}`} target="_blank" rel="noreferrer">View source post</a></h3><button disabled={busy} onClick={()=>inspect(r)}>Load original promise</button>{excerpt?.id===r.id&&<blockquote>{excerpt.text}</blockquote>}<p className={styles.note}>Deadline: {r.deadline||"Not stated"}<br/>Registered by: {r.owner}</p>{r.latest&&<p>{r.latest.summary}</p>}<details><summary>Recorded fingerprint</summary><p className={styles.note}>{r.quote_sha256}</p></details></article>)}
      <button disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-10))}>Previous</button><button disabled={offset+10>=total} onClick={()=>setOffset(offset+10)}>Next</button><p className={styles.note}>{total} public promises</p>
      <label htmlFor="record">Promise to verify (current page)</label><select id="record" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose a promise</option>{records.map(r=><option key={r.id} value={r.id}>#{r.id} · Post {r.post_id}</option>)}</select>
      <label htmlFor="evidence">Separate public evidence page (HTTPS)</label><input id="evidence" type="url" value={evidence} onChange={e=>setEvidence(e.target.value)} placeholder="https://project.example/release-notes"/>
      <p className={styles.note}>Only the registering wallet can update a record. Use a focused public page with completion evidence. X links are not supported as evidence in this version. An unreadable source returns UNVERIFIABLE; a missed date alone does not mean BROKEN.</p>
      {chosen&&account&&chosen.owner.toLowerCase()!==account.toLowerCase()&&<p className={styles.error}>Switch to the wallet that registered this promise.</p>}
      <button disabled={blocked||!chosen||!evidence.trim()||!!(account&&chosen.owner.toLowerCase()!==account.toLowerCase())} onClick={()=>send("verify_promise",[Number(selected),evidence.trim()])}>Verify with wallet</button>
    </section>
    <section className={styles.card}><h2>Verification history</h2>{history.map(h=><article className={styles.row} key={h.id}><span className={styles.badge}>{h.status}</span><p>Promise #{h.record_id} · {h.checked_at}</p><p>{h.summary}</p><a href={h.evidence_url} target="_blank" rel="noreferrer">Evidence source</a>{h.quotes.map((q,i)=><blockquote key={i}>{q}</blockquote>)}</article>)}{!history.length&&<p>No verification events loaded.</p>}<button disabled={!historyOffset} onClick={()=>setHistoryOffset(Math.max(0,historyOffset-10))}>Previous events</button><button disabled={historyOffset+10>=historyTotal} onClick={()=>setHistoryOffset(historyOffset+10)}>Next events</button></section>
  </main>;
}
