import type { CalldataEncodable } from "genlayer-js/types";
import { localnet, studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";
import { createClient } from "genlayer-js";
import type { TxProgress, TxStage } from "./types";
export type { TxProgress } from "./types";

const ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS?.trim() || "") as `0x${string}`;
type NetworkName = "localnet" | "studionet" | "testnetAsimov" | "testnetBradbury";
const configured = process.env.NEXT_PUBLIC_NETWORK?.trim();
const NETWORK: NetworkName = configured === "localnet" || configured === "studionet" || configured === "testnetAsimov" || configured === "testnetBradbury" ? configured : "studionet";
const CHAINS = { localnet, studionet, testnetAsimov, testnetBradbury } as const;

function assertAddress() {
  if (!/^0x[0-9a-fA-F]{40}$/.test(ADDRESS)) throw new Error("TermsGuard contract address is invalid. Set NEXT_PUBLIC_CONTRACT_ADDRESS in Vercel.");
  return ADDRESS;
}
function getChain() { return CHAINS[NETWORK]; }
export function isConfigured() { return /^0x[0-9a-fA-F]{40}$/.test(ADDRESS); }
export function contractAddress() { return ADDRESS; }
export function networkName() { return NETWORK; }

export async function readContract(functionName: string, args: CalldataEncodable[] = []) {
  const client = createClient({ chain: getChain() });
  return client.readContract({ address: assertAddress(), functionName, args });
}

export async function writeContract(functionName: string, args: CalldataEncodable[] = []) {
  if (typeof window === "undefined" || !window.ethereum) throw new Error("Connect a compatible browser wallet to continue.");
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  const account = accounts?.[0];
  if (!account) throw new Error("Wallet connection was cancelled.");
  const client = createClient({ chain: getChain(), account: account as `0x${string}`, provider: window.ethereum as any });
  await client.connect(NETWORK);
  const hash = await client.writeContract({ address: assertAddress(), functionName, args, value: BigInt(0) });
  return { hash: String(hash), client };
}

function normalizeName(raw: unknown): string {
  return String(raw ?? "").trim().replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[\s-]+/g, "_").toUpperCase();
}

function normalizeStatus(raw: unknown): TxStage {
  const value = typeof raw === "number" || typeof raw === "bigint" ? String(raw) : normalizeName(raw) || "UNKNOWN";
  // Consensus v0.6 materialized status codes. There is no READY_TO_FINALIZE status.
  const numeric: Record<string, TxStage> = {
    "0": "UNINITIALIZED", "1": "PENDING", "2": "PROPOSING", "3": "COMMITTING",
    "4": "REVEALING", "5": "ACCEPTED", "6": "UNDETERMINED", "7": "FINALIZED",
    "8": "CANCELED", "9": "APPEAL_REVEALING", "10": "APPEAL_COMMITTING",
    "11": "VALIDATORS_TIMEOUT", "12": "LEADER_TIMEOUT", "13": "LEADER_REVEALING",
  };
  if (numeric[value]) return numeric[value];
  const known: TxStage[] = ["UNINITIALIZED","PENDING","PROPOSING","COMMITTING","REVEALING","LEADER_REVEALING","ACCEPTED","UNDETERMINED","FINALIZED","CANCELED","APPEAL_REVEALING","APPEAL_COMMITTING","VALIDATORS_TIMEOUT","LEADER_TIMEOUT"];
  return known.includes(value as TxStage) ? value as TxStage : "UNKNOWN";
}

function normalizeExecution(raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return "UNKNOWN";
  if (typeof raw === "number" || typeof raw === "bigint" || /^\d+$/.test(String(raw))) {
    const numeric: Record<string,string> = { "0":"NOT_VOTED", "1":"FINISHED_WITH_RETURN", "2":"FINISHED_WITH_ERROR", "3":"TIMEOUT", "4":"NONDET_DISAGREE", "5":"DETERMINISTIC_VIOLATION" };
    return numeric[String(raw)] ?? "UNKNOWN";
  }
  return normalizeName(raw) || "UNKNOWN";
}

function executionSucceeded(execution: string) {
  const v = execution.toUpperCase();
  return v === "FINISHED_WITH_RETURN" || v === "RETURN" || v === "SUCCESS";
}
export function executionFailed(execution: string) {
  const v = execution.toUpperCase();
  return v === "FINISHED_WITH_ERROR" || v === "ERROR" || v === "FAILED" || v === "REVERT" || v === "ROLLBACK" || v === "FAILURE" || v === "TIMEOUT" || v === "NONDET_DISAGREE" || v === "DETERMINISTIC_VIOLATION";
}

function receiptResultStatus(result: any): string {
  if (result && typeof result === "object") return normalizeName(result.status).toLowerCase();
  if (typeof result !== "string" || !result) return "";
  try {
    const bytes = atob(result);
    return ["return","rollback","contract_error","error","none","no_leaders"][bytes.charCodeAt(0)] ?? "";
  } catch { return ""; }
}

export function transactionProgress(tx: any, hash: string): TxProgress {
  const status = normalizeStatus(tx?.statusName ?? tx?.status_name ?? tx?.status ?? tx?.statusCode);
  const resultName = normalizeName(tx?.result_name ?? tx?.txResultName ?? tx?.resultName ?? tx?.result);

  // IMPORTANT: txExecutionResult is the canonical decided execution outcome.
  // Never let an individual/intermediate leader receipt override it.
  const canonicalRaw = tx?.txExecutionResultName ?? tx?.tx_execution_result_name ?? tx?.txExecutionResult ?? tx?.tx_execution_result;
  const canonical = normalizeExecution(canonicalRaw);

  const rawReceipts = tx?.consensus_data?.leader_receipt ?? tx?.consensusData?.leaderReceipt ?? tx?.leader_receipt ?? tx?.leaderReceipt ?? tx?.receipt;
  const receipts = (Array.isArray(rawReceipts) ? rawReceipts : [rawReceipts]).filter((r:any) => r && typeof r === "object");
  const receiptStatuses = receipts.flatMap((r:any) => [receiptResultStatus(r.result), normalizeName(r.status).toLowerCase()]).filter(Boolean);
  const receiptReturn = receiptStatuses.includes("return");
  const receiptFailure = receiptStatuses.find((v:string) => ["rollback","contract_error","error","no_leaders"].includes(v));

  // Receipt data is fallback only when the canonical field is not decided yet.
  let execution = canonical;
  let receiptStatus = receiptReturn ? "return" : (receiptFailure || "");
  if (canonical === "UNKNOWN" || canonical === "NOT_VOTED") {
    if (receiptReturn) execution = "FINISHED_WITH_RETURN";
    else if (receiptFailure) execution = "FINISHED_WITH_ERROR";
  }

  const decided = status === "ACCEPTED" || status === "FINALIZED";
  const consensusFailure = ["MAJORITY_DISAGREE","UNDETERMINED","MAJORITY_TIMEOUT","NO_MAJORITY","DETERMINISTIC_VIOLATION"].includes(resultName);
  const success = decided && executionSucceeded(execution) && !consensusFailure;
  return { hash, status, execution, resultName, receiptStatus, success };
}

export async function getTransactionProgress(client:any, hash:string):Promise<TxProgress> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("Enter a valid transaction hash (0x and 64 hexadecimal characters).");
  return transactionProgress(await client.getTransaction({ hash }), hash);
}
export function transactionReader() { return createClient({ chain: getChain() }); }

export async function waitForAccepted(client:any, hash:string, onProgress?:(p:TxProgress)=>void, timeoutMs=30*60_000) {
  const started=Date.now();
  while (Date.now()-started<timeoutMs) {
    const p=await getTransactionProgress(client,hash); onProgress?.(p);
    if (p.status === "ACCEPTED" || p.status === "FINALIZED") {
      if (executionFailed(p.execution)) throw new Error(`Contract execution failed at ${p.status}. Execution: ${p.execution}. Hash: ${hash}`);
      if (p.success) return p;
      // At ACCEPTED the canonical execution field can lag briefly; keep polling instead of declaring failure.
      if (p.status === "FINALIZED" && p.execution !== "UNKNOWN" && p.execution !== "NOT_VOTED") throw new Error(`Finalized without a successful execution result. Execution: ${p.execution}. Hash: ${hash}`);
    }
    if (["CANCELED","VALIDATORS_TIMEOUT","LEADER_TIMEOUT"].includes(p.status)) throw new Error(`Transaction ${p.status}. No successful contract state update was confirmed. Hash: ${hash}`);
    if (p.status === "UNDETERMINED") throw new Error(`Consensus is UNDETERMINED. Do not submit the same transaction again automatically. Hash: ${hash}`);
    await new Promise(r=>setTimeout(r,4000));
  }
  throw new Error(`Transaction is still processing. Hash: ${hash}`);
}

export async function watchFinalized(client:any, hash:string, onProgress?:(p:TxProgress)=>void, timeoutMs=60*60_000) {
  const started=Date.now(); let last:TxProgress|null=null;
  while (Date.now()-started<timeoutMs) {
    const p=await getTransactionProgress(client,hash); last=p; onProgress?.(p);
    if (["FINALIZED","CANCELED","UNDETERMINED","VALIDATORS_TIMEOUT","LEADER_TIMEOUT"].includes(p.status)) return p;
    await new Promise(r=>setTimeout(r,5000));
  }
  return last ?? { hash, status:"UNKNOWN" as TxStage, execution:"UNKNOWN", resultName:"", receiptStatus:"", success:false };
}

export async function waitForState(readState:()=>Promise<any>, predicate:(value:any)=>boolean, maxChecks=72) {
  let last:any;
  for (let i=0;i<maxChecks;i++) {
    try { last=await readState(); if (predicate(last)) return last; } catch {}
    await new Promise(r=>setTimeout(r,3000));
  }
  return last;
}

declare global {
  interface Window { ethereum?: { request:(args:{method:string;params?:unknown[]})=>Promise<any>; on?:(event:string,listener:(...args:any[])=>void)=>void; removeListener?:(event:string,listener:(...args:any[])=>void)=>void; }; }
}
