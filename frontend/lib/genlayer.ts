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
  const chain = CHAINS[NETWORK];
  if (!chain) {
    throw new Error(`GenLayer network ${NETWORK} is not available in this SDK.`);
  }
  return chain;
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
  const client = createClient({
    chain: getChain(),
  });

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

  // Ensures MetaMask is actually on the same GenLayer network as the SDK.
  await client.connect(NETWORK);

  const hash = await client.writeContract({
    address: assertAddress(),
    functionName,
    args,
    value: BigInt(0),
  });

  return { hash: String(hash), client };
}

function normalizeStatus(raw: unknown): TxStage {
  const value =
    typeof raw === "number"
      ? String(raw)
      : String(raw ?? "UNKNOWN").toUpperCase();

  // Some RPC/Studio versions expose the numeric transaction status.
  // Keep these mappings here so a numeric status never becomes a false error.
  if (value === "0") return "PENDING";
  if (value === "1") return "PROPOSING";
  if (value === "2") return "COMMITTING";
  if (value === "3") return "ACCEPTED";
  if (value === "4") return "FINALIZED";
  if (value === "5") return "CANCELED";
  if (value === "6") return "UNDETERMINED";

  if (
    value === "PENDING" ||
    value === "PROPOSING" ||
    value === "COMMITTING" ||
    value === "REVEALING" ||
    value === "ACCEPTED" ||
    value === "FINALIZED" ||
    value === "CANCELED" ||
    value === "UNDETERMINED"
  ) {
    return value;
  }

  return "UNKNOWN";
}

export async function getTransactionProgress(
  client: any,
  hash: string,
): Promise<TxProgress> {
  const tx = await client.getTransaction({ hash });

  return {
    hash,
    status: normalizeStatus(tx?.status),
    execution: String(
      tx?.txExecutionResultName ??
        tx?.txExecutionResult ??
        tx?.execution_result ??
        "",
    ),
  };
}

function executionFailed(execution: string) {
  const value = execution.toUpperCase();
  return (
    value.includes("FINISHED_WITH_ERROR") ||
    value.includes("ERROR") ||
    value.includes("FAILED") ||
    value.includes("REVERT")
  );
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

    if (progress.status === "ACCEPTED" || progress.status === "FINALIZED") {
      if (executionFailed(progress.execution ?? "")) {
        throw new Error(
          `Contract execution failed before state update: ${progress.execution}`,
        );
      }
      return progress;
    }

    if (progress.status === "CANCELED") {
      throw new Error(
        "GenLayer canceled this transaction. No contract state was changed.",
      );
    }

    if (progress.status === "UNDETERMINED") {
      throw new Error(
        "GenLayer could not determine the transaction result. Check Audit mode before retrying.",
      );
    }

    // UNKNOWN is not treated as failure. RPC/Studio can briefly return a
    // shape that is not yet normalized while consensus is progressing.
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }

  // Do not report a timeout as a contract failure. The transaction may still
  // be progressing through consensus/finality.
  throw new Error(
    `Transaction is still processing. Keep this transaction open and do not submit it again. Hash: ${hash}`,
  );
}

export async function watchFinalized(
  client: any,
  hash: string,
  onProgress?: (p: TxProgress) => void,
  timeoutMs = 60 * 60_000,
) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const progress = await getTransactionProgress(client, hash);
    onProgress?.(progress);

    if (
      progress.status === "FINALIZED" ||
      progress.status === "CANCELED" ||
      progress.status === "UNDETERMINED"
    ) {
      return progress;
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  return { hash, status: "UNKNOWN" as TxStage };
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
      // Accepted state can take a little time to become readable through RPC.
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
    };
  }
}
