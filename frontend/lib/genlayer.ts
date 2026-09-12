import type { CalldataEncodable } from "genlayer-js/types";
import {
  localnet,
  studionet,
  testnetAsimov,
  testnetBradbury,
} from "genlayer-js/chains";
import { createClient } from "genlayer-js";
import type { TxProgress, TxStage } from "./types";
export type { TxProgress } from "./types";

const ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS?.trim() || "") as `0x${string}`;

type NetworkName =
  | "localnet"
  | "studionet"
  | "testnetAsimov"
  | "testnetBradbury";

const configured = process.env.NEXT_PUBLIC_NETWORK?.trim();
const NETWORK: NetworkName =
  configured === "localnet" ||
  configured === "studionet" ||
  configured === "testnetAsimov" ||
  configured === "testnetBradbury"
    ? configured
    : "studionet";

const CHAINS = {
  localnet,
  studionet,
  testnetAsimov,
  testnetBradbury,
} as const;

function assertAddress() {
  if (!/^0x[0-9a-fA-F]{40}$/.test(ADDRESS)) {
    throw new Error(
      "TermsGuard contract address is invalid. Set NEXT_PUBLIC_CONTRACT_ADDRESS in Vercel.",
    );
  }
  return ADDRESS;
}

function getChain() {
  return CHAINS[NETWORK];
}

export function isConfigured() {
  return /^0x[0-9a-fA-F]{40}$/.test(ADDRESS);
}

export function contractAddress() {
  return ADDRESS;
}

export function networkName() {
  return NETWORK;
}

export async function readContract(
  functionName: string,
  args: CalldataEncodable[] = [],
) {
  const client = createClient({ chain: getChain() });

  return client.readContract({
    address: assertAddress(),
    functionName,
    args,
  });
}

export async function writeContract(
  functionName: string,
  args: CalldataEncodable[] = [],
) {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("Connect a compatible browser wallet to continue.");
  }

  const accounts = await window.ethereum.request({
    method: "eth_requestAccounts",
  });
  const account = accounts?.[0];

  if (!account) {
    throw new Error("Wallet connection was cancelled.");
  }

  const client = createClient({
    chain: getChain(),
    account: account as `0x${string}`,
    provider: window.ethereum as any,
  });

  await client.connect(NETWORK);

  const hash = await client.writeContract({
    address: assertAddress(),
    functionName,
    args,
    value: BigInt(0),
  });

  return { hash: String(hash), client };
}

function normalizeName(raw: unknown): string {
  return String(raw ?? "").trim().replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[\s-]+/g, "_").toUpperCase();
}

function normalizeStatus(raw: unknown): TxStage {
  const value =
    typeof raw === "number" || typeof raw === "bigint"
      ? String(raw)
      : normalizeName(raw) || "UNKNOWN";

  const numeric: Record<string, TxStage> = {
    "0": "UNINITIALIZED",
    "1": "PENDING",
    "2": "PROPOSING",
    "3": "COMMITTING",
    "4": "REVEALING",
    "5": "ACCEPTED",
    "6": "UNDETERMINED",
    "7": "FINALIZED",
    "8": "CANCELED",
    "9": "APPEAL_REVEALING",
    "10": "APPEAL_COMMITTING",
    "11": "READY_TO_FINALIZE",
    "12": "VALIDATORS_TIMEOUT",
    "13": "LEADER_TIMEOUT",
    "14": "LEADER_REVEALING",
  };

  if (numeric[value]) return numeric[value];

  const known: TxStage[] = [
    "UNINITIALIZED",
    "PENDING",
    "PROPOSING",
    "COMMITTING",
    "REVEALING",
    "LEADER_REVEALING",
    "ACCEPTED",
    "UNDETERMINED",
    "FINALIZED",
    "CANCELED",
    "APPEAL_REVEALING",
    "APPEAL_COMMITTING",
    "READY_TO_FINALIZE",
    "VALIDATORS_TIMEOUT",
    "LEADER_TIMEOUT",
  ];

  return known.includes(value as TxStage) ? (value as TxStage) : "UNKNOWN";
}

function normalizeExecution(raw: unknown): string {
  if (typeof raw === "number" || typeof raw === "bigint" || /^\d+$/.test(String(raw))) {
    const numeric: Record<string, string> = {
      "0": "NOT_VOTED",
      "1": "FINISHED_WITH_RETURN",
      "2": "FINISHED_WITH_ERROR",
      "3": "TIMEOUT",
      "4": "NONDET_DISAGREE",
      "5": "DETERMINISTIC_VIOLATION",
    };
    return numeric[String(raw)] ?? String(raw);
  }
  return normalizeName(raw) || "UNKNOWN";
}

function executionSucceeded(execution: string) {
  const value = execution.toUpperCase();
  return (
    value === "FINISHED_WITH_RETURN" ||
    value === "RETURN" ||
    value === "SUCCESS"
  );
}

export function executionFailed(execution: string) {
  const value = execution.toUpperCase();
  return (
    value.includes("FINISHED_WITH_ERROR") ||
    value.includes("ERROR") ||
    value.includes("FAILED") ||
    value.includes("REVERT") ||
    value === "ROLLBACK" ||
    value === "FAILURE" ||
    value.includes("NONDET_DISAGREE") ||
    value.includes("NONDETDISAGREE") ||
    value.includes("TIMEOUT") ||
    value.includes("DETERMINISTIC_VIOLATION") ||
    value.includes("DETERMINISTICVIOLATION")
  );
}

// Studionet uses consensus_data.leader_receipt; testnets expose top-level
// txExecutionResult. Consensus votes must never substitute for execution.
function receiptResultStatus(result: any): string {
  if (result && typeof result === "object") return normalizeName(result.status).toLowerCase();
  if (typeof result !== "string" || !result) return "";
  try {
    const bytes = atob(result);
    // GenVM result-byte enum differs from txExecutionResult: Return is 0 here.
    return ["return", "rollback", "contract_error", "error", "none", "no_leaders"][bytes.charCodeAt(0)] ?? "";
  } catch { return ""; }
}

export function transactionProgress(tx: any, hash: string): TxProgress {
  const status = normalizeStatus(tx?.statusName ?? tx?.status_name ?? tx?.status ?? tx?.statusCode);
  const resultName = normalizeName(tx?.result_name ?? tx?.txResultName ?? tx?.resultName);
  const rawReceipts = tx?.consensus_data?.leader_receipt ?? tx?.consensusData?.leaderReceipt
    ?? tx?.leader_receipt ?? tx?.leaderReceipt ?? tx?.receipt;
  const receipts = (Array.isArray(rawReceipts) ? rawReceipts : [rawReceipts])
    .filter((r: any) => r && typeof r === "object");
  const top = [tx?.txExecutionResultName, tx?.tx_execution_result_name,
    tx?.txExecutionResult, tx?.tx_execution_result, tx?.execution_result_name,
    tx?.execution_result, tx?.executionResult].map(normalizeExecution);
  const nested = receipts.flatMap((r: any) => [r.execution_result, r.executionResult].map(normalizeExecution));
  const statuses = receipts.flatMap((r: any) => [receiptResultStatus(r.result), normalizeName(r.status).toLowerCase()]);
  const badReceipt = statuses.find((v: string) => ["rollback", "contract_error", "error", "no_leaders"].includes(v));
  const receiptError = receipts.some((r: any) => r.error != null && r.error !== "");
  const candidates = [...top, ...nested];
  const failure = candidates.find(executionFailed);
  // Multiple leader receipts with mixed results are ambiguous; never pick an
  // earlier successful leader and hide an error from another receipt.
  const receiptStatus = badReceipt || (receiptError ? "contract_error" : statuses.includes("return") ? "return" : "");
  const execution = failure || (badReceipt || receiptError ? "FINISHED_WITH_ERROR" :
    candidates.find(executionSucceeded) || (receiptStatus === "return" ? "FINISHED_WITH_RETURN" :
      candidates.find((v) => v !== "UNKNOWN") || "UNKNOWN"));
  const decided = ["ACCEPTED", "READY_TO_FINALIZE", "FINALIZED"].includes(status);
  const success = decided && executionSucceeded(execution) && !failure && !badReceipt && !receiptError
    && !["MAJORITY_DISAGREE", "UNDETERMINED", "MAJORITY_TIMEOUT", "NO_MAJORITY", "DETERMINISTIC_VIOLATION"].includes(resultName);
  return {hash, status, execution, resultName, receiptStatus, success};
}

export async function getTransactionProgress(client: any, hash: string): Promise<TxProgress> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("Enter a valid transaction hash (0x and 64 hexadecimal characters).");
  return transactionProgress(await client.getTransaction({hash}), hash);
}

export function transactionReader() {
  return createClient({chain: getChain()});
}

export async function waitForAccepted(
  client: any,
  hash: string,
  onProgress?: (p: TxProgress) => void,
  timeoutMs = 30 * 60_000,
) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const progress = await getTransactionProgress(client, hash);
    onProgress?.(progress);

    if (
      progress.status === "ACCEPTED" ||
      progress.status === "READY_TO_FINALIZE" ||
      progress.status === "FINALIZED"
    ) {
      if (executionFailed(progress.execution) || progress.receiptStatus === "contract_error") {
        throw new Error(
          `Contract execution failed at ${progress.status}. Execution: ${progress.execution}. Hash: ${hash}`,
        );
      }
      if (progress.success) return progress;
      // Finality without an execution result is unknown, never success.
      if (progress.status === "FINALIZED") {
        throw new Error(`Finalized, but successful execution could not be confirmed. Resume checking this transaction; do not resubmit. Hash: ${hash}`);
      }
    }

    if (
      progress.status === "CANCELED" ||
      progress.status === "VALIDATORS_TIMEOUT" ||
      progress.status === "LEADER_TIMEOUT"
    ) {
      throw new Error(
        `Transaction ${progress.status}. No successful contract state update was confirmed. Hash: ${hash}`,
      );
    }

    if (progress.status === "UNDETERMINED") {
      throw new Error(
        `Consensus is UNDETERMINED. Do not submit the same transaction again automatically. Hash: ${hash}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 4000));
  }

  throw new Error(
    `Transaction is still processing. Hash: ${hash}`,
  );
}

export async function watchFinalized(
  client: any,
  hash: string,
  onProgress?: (p: TxProgress) => void,
  timeoutMs = 60 * 60_000,
) {
  const started = Date.now();
  let last: TxProgress | null = null;

  while (Date.now() - started < timeoutMs) {
    const progress = await getTransactionProgress(client, hash);
    last = progress;
    onProgress?.(progress);

    if (
      progress.status === "FINALIZED" ||
      progress.status === "CANCELED" ||
      progress.status === "UNDETERMINED" ||
      progress.status === "VALIDATORS_TIMEOUT" ||
      progress.status === "LEADER_TIMEOUT"
    ) {
      return progress;
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  return last ?? {
    hash,
    status: "UNKNOWN" as TxStage,
    execution: "UNKNOWN",
    resultName: "",
    receiptStatus: "",
    success: false,
  };
}

export async function waitForState(
  readState: () => Promise<any>,
  predicate: (value: any) => boolean,
  maxChecks = 72,
) {
  let last: any;

  for (let i = 0; i < maxChecks; i += 1) {
    try {
      last = await readState();
      if (predicate(last)) return last;
    } catch {
      // State may become readable shortly after acceptance/finality.
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  return last;
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: {
        method: string;
        params?: unknown[];
      }) => Promise<any>;
      on?: (event: string, listener: (...args: any[]) => void) => void;
      removeListener?: (event: string, listener: (...args: any[]) => void) => void;
    };
  }
}

