import type { CalldataEncodable, Network } from "genlayer-js/types";

// Public deployed TermsGuard contract. Vercel can override this with
// NEXT_PUBLIC_CONTRACT_ADDRESS when a newer deployment is used.
const DEFAULT_CONTRACT_ADDRESS = "0x276f491953DE761d643949F6C154BCB8e9Bad161";
const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS?.trim() || DEFAULT_CONTRACT_ADDRESS;

const configuredNetwork = process.env.NEXT_PUBLIC_NETWORK;
const NETWORK: Network =
  configuredNetwork === "localnet" ||
  configuredNetwork === "testnetAsimov" ||
  configuredNetwork === "testnetBradbury" ||
  configuredNetwork === "studionet"
    ? configuredNetwork
    : "studionet";

type ContractAddress = `0x${string}`;

function getContractAddress(): ContractAddress {
  if (!/^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS)) {
    throw new Error("Invalid TermsGuard contract address.");
  }
  return CONTRACT_ADDRESS as ContractAddress;
}

async function getSDK() {
  return import("genlayer-js");
}

async function getChain() {
  const chains = await import("genlayer-js/chains");
  switch (NETWORK) {
    case "localnet": return chains.localnet;
    case "testnetAsimov": return chains.testnetAsimov;
    case "testnetBradbury": return chains.testnetBradbury;
    case "studionet":
    default: return chains.studionet;
  }
}

export function isLive() {
  return /^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS);
}

export async function readContract(functionName: string, args: CalldataEncodable[] = []) {
  if (!isLive()) throw new Error("TermsGuard contract address is not configured.");
  const { createClient } = await getSDK();
  const chain = await getChain();
  const client = createClient({ chain: chain as any });
  return client.readContract({
    address: getContractAddress(),
    functionName,
    args,
  });
}

export async function writeContract(functionName: string, args: CalldataEncodable[] = []) {
  if (!isLive()) throw new Error("TermsGuard contract address is not configured.");
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No browser wallet provider detected.");
  }

  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  const account = accounts?.[0];
  if (!account) throw new Error("Wallet connection was cancelled.");

  const { createClient } = await getSDK();
  const chain = await getChain();
  const client = createClient({
    chain: chain as any,
    account: account as `0x${string}`,
    provider: window.ethereum as any,
  });

  await client.connect(NETWORK);

  const hash = await client.writeContract({
    address: getContractAddress(),
    functionName,
    args,
    value: BigInt(0),
  });

  return { hash: String(hash), client };
}

export type TransactionStage =
  | "PENDING" | "PROPOSING" | "COMMITTING" | "REVEALING" | "ACCEPTED"
  | "FINALIZED" | "CANCELED" | "UNDETERMINED" | "READY_TO_FINALIZE"
  | "VALIDATORS_TIMEOUT" | "LEADER_TIMEOUT" | "UNKNOWN";

export type TransactionProgress = {
  hash: string;
  status: TransactionStage;
  statusCode?: number;
};

const CODE_TO_STATUS: Record<number, TransactionStage> = {
  0: "UNKNOWN",
  1: "PENDING",
  2: "PROPOSING",
  3: "COMMITTING",
  4: "REVEALING",
  5: "ACCEPTED",
  6: "UNDETERMINED",
  7: "FINALIZED",
  8: "CANCELED",
  9: "REVEALING",
  10: "COMMITTING",
  11: "READY_TO_FINALIZE",
  12: "VALIDATORS_TIMEOUT",
  13: "LEADER_TIMEOUT",
};

function normalizeStatus(value: unknown, statusCode?: unknown): TransactionStage {
  if (typeof value === "string") {
    const s = value.toUpperCase().replace(/\s+/g, "_");
    if (s in CODE_TO_STATUS) return CODE_TO_STATUS[Number(s)];
    const allowed: TransactionStage[] = [
      "PENDING","PROPOSING","COMMITTING","REVEALING","ACCEPTED","FINALIZED",
      "CANCELED","UNDETERMINED","READY_TO_FINALIZE","VALIDATORS_TIMEOUT","LEADER_TIMEOUT","UNKNOWN",
    ];
    if (allowed.includes(s as TransactionStage)) return s as TransactionStage;
  }
  const code = typeof statusCode === "bigint" ? Number(statusCode) : Number(statusCode);
  return Number.isFinite(code) && CODE_TO_STATUS[code] ? CODE_TO_STATUS[code] : "UNKNOWN";
}

export async function getTransactionProgress(client: any, hash: string): Promise<TransactionProgress> {
  try {
    // getTransaction is supported by GenLayerJS and exposes consensus status.
    const tx = await client.getTransaction({ hash });
    const statusCode = typeof tx?.status === "number" || typeof tx?.status === "bigint"
      ? Number(tx.status)
      : typeof tx?.statusCode === "number" || typeof tx?.statusCode === "bigint"
        ? Number(tx.statusCode)
        : undefined;
    const status = normalizeStatus(tx?.statusName ?? tx?.statusText ?? tx?.status, statusCode);
    return { hash, status, statusCode };
  } catch {
    // A just-submitted transaction can briefly be unavailable from a read RPC.
    return { hash, status: "PENDING", statusCode: 1 };
  }
}

const TERMINAL_FAILURES = new Set<TransactionStage>([
  "CANCELED", "UNDETERMINED", "VALIDATORS_TIMEOUT", "LEADER_TIMEOUT",
]);

/**
 * Wait until consensus is ACCEPTED, not FINALIZED.
 * Accepted state is already readable on GenLayer, so the UI can update without
 * the old 15-minute FINALIZED timeout. Finalization can continue on-chain.
 */
export async function waitForAccepted(
  client: any,
  hash: string,
  onProgress?: (progress: TransactionProgress) => void,
) {
  const intervalMs = 3000;
  const maxChecks = 200; // 10 minutes

  for (let attempt = 0; attempt < maxChecks; attempt += 1) {
    const progress = await getTransactionProgress(client, hash);
    onProgress?.(progress);

    if (progress.status === "ACCEPTED" || progress.status === "FINALIZED") {
      const { TransactionStatus } = await import("genlayer-js/types");
      const receipt = await client.waitForTransactionReceipt({
        hash,
        status: progress.status === "FINALIZED"
          ? TransactionStatus.FINALIZED
          : TransactionStatus.ACCEPTED,
        interval: intervalMs,
        retries: 20,
        fullTransaction: false,
      });

      const execution = String(receipt?.txExecutionResultName ?? "").toUpperCase();
      if (execution.includes("ERROR")) {
        throw new Error("GenLayer accepted the transaction but contract execution failed.");
      }
      return receipt;
    }

    if (TERMINAL_FAILURES.has(progress.status)) {
      throw new Error(`Transaction ended with status ${progress.status}.`);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Transaction is still processing. Hash: ${hash}`);
}

export const waitFinalized = waitForAccepted;

export function contractAddress() { return CONTRACT_ADDRESS; }
export function networkName() { return NETWORK; }

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<any>;
    };
  }
}
