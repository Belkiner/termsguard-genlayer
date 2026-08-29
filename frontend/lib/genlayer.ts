import type { CalldataEncodable, Network } from "genlayer-js/types";
import type { TxProgress, TxStage } from "./types";

const DEFAULT_ADDRESS = "0x276f491953DE761d643949F6C154BCB8e9Bad161";
const ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS?.trim() || DEFAULT_ADDRESS) as `0x${string}`;
const configured = process.env.NEXT_PUBLIC_NETWORK;
const NETWORK: Network =
  configured === "localnet" ||
  configured === "studionet" ||
  configured === "testnetAsimov" ||
  configured === "testnetBradbury"
    ? configured
    : "studionet";

function assertAddress() {
  if (!/^0x[0-9a-fA-F]{40}$/.test(ADDRESS)) {
    throw new Error("TermsGuard contract address is invalid.");
  }
  return ADDRESS;
}

async function getChain(): Promise<any> {
  const chains = await import("genlayer-js/chains");
  return chains[NETWORK];
}

async function sdk() {
  return import("genlayer-js");
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

export async function readContract(functionName: string, args: CalldataEncodable[] = []) {
  const { createClient } = await sdk();
  const client = createClient({ chain: await getChain() as any });
  return client.readContract({
    address: assertAddress(),
    functionName,
    args,
  });
}

export async function writeContract(functionName: string, args: CalldataEncodable[] = []) {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("Connect a compatible wallet to continue.");
  }

  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  const account = accounts?.[0];
  if (!account) throw new Error("Wallet connection was cancelled.");

  const { createClient } = await sdk();
  const client = createClient({
    chain: await getChain() as any,
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

function normalizeStatus(raw: unknown): TxStage {
  const value = String(raw ?? "UNKNOWN").toUpperCase();
  if (
    value === "PENDING" ||
    value === "PROPOSING" ||
    value === "COMMITTING" ||
    value === "REVEALING" ||
    value === "ACCEPTED" ||
    value === "FINALIZED" ||
    value === "CANCELED" ||
    value === "UNDETERMINED"
  ) return value;
  return "UNKNOWN";
}

export async function getTransactionProgress(client: any, hash: string): Promise<TxProgress> {
  const tx = await client.getTransaction({ hash });
  return {
    hash,
    status: normalizeStatus(tx?.status),
    execution: String(tx?.txExecutionResultName ?? tx?.txExecutionResult ?? ""),
  };
}

export async function waitForAccepted(
  client: any,
  hash: string,
  onProgress?: (p: TxProgress) => void,
  timeoutMs = 15 * 60_000,
) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const progress = await getTransactionProgress(client, hash);
    onProgress?.(progress);

    if (progress.status === "ACCEPTED" || progress.status === "FINALIZED") {
      const execution = progress.execution.toUpperCase();
      if (execution.includes("ERROR") || execution.includes("FAILED") || execution.includes("REVERT")) {
        throw new Error(`Contract execution failed: ${progress.execution}`);
      }
      return progress;
    }

    if (progress.status === "CANCELED" || progress.status === "UNDETERMINED") {
      throw new Error(`Transaction ended as ${progress.status}. Open Audit mode for the transaction details.`);
    }

    await new Promise((r) => setTimeout(r, 4000));
  }

  throw new Error(`The transaction is still processing. It was not treated as failed. Hash: ${hash}`);
}

export async function watchFinalized(
  client: any,
  hash: string,
  onProgress?: (p: TxProgress) => void,
  timeoutMs = 30 * 60_000,
) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const progress = await getTransactionProgress(client, hash);
    onProgress?.(progress);

    if (progress.status === "FINALIZED" || progress.status === "CANCELED" || progress.status === "UNDETERMINED") {
      return progress;
    }

    await new Promise((r) => setTimeout(r, 5000));
  }

  return { hash, status: "UNKNOWN" as TxStage };
}

export async function waitForState(
  readState: () => Promise<any>,
  predicate: (value: any) => boolean,
  maxChecks = 48,
) {
  let last: any;
  for (let i = 0; i < maxChecks; i += 1) {
    try {
      last = await readState();
      if (predicate(last)) return last;
    } catch {
      // RPC state can lag after ACCEPTED.
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  return last;
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<any>;
    };
  }
}
