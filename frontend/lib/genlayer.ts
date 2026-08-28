import type { CalldataEncodable, Network } from "genlayer-js/types";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "";

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
    throw new Error(
      "NEXT_PUBLIC_CONTRACT_ADDRESS must be a valid 0x contract address.",
    );
  }

  return CONTRACT_ADDRESS as ContractAddress;
}

async function getSDK() {
  return import("genlayer-js");
}

async function getChain() {
  const chains = await import("genlayer-js/chains");

  switch (NETWORK) {
    case "localnet":
      return chains.localnet;

    case "testnetAsimov":
      return chains.testnetAsimov;

    case "testnetBradbury":
      return chains.testnetBradbury;

    case "studionet":
    default:
      return chains.studionet;
  }
}

export function isLive() {
  return Boolean(CONTRACT_ADDRESS);
}

export async function readContract(
  functionName: string,
  args: CalldataEncodable[] = [],
) {
  if (!isLive()) {
    throw new Error("TermsGuard is running in Demo Mode.");
  }

  const { createClient } = await getSDK();
  const chain = await getChain();

  const client = createClient({
    chain: chain as any,
  });

  return client.readContract({
    address: getContractAddress(),
    functionName,
    args,
  });
}

export async function writeContract(
  functionName: string,
  args: CalldataEncodable[] = [],
) {
  if (!isLive()) {
    throw new Error(
      "Deploy the contract and set NEXT_PUBLIC_CONTRACT_ADDRESS first.",
    );
  }

  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No browser wallet provider detected.");
  }

  const accounts = await window.ethereum.request({
    method: "eth_requestAccounts",
  });

  const account = accounts?.[0];

  if (!account) {
    throw new Error("Wallet connection was cancelled.");
  }

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

  return {
    hash,
    client,
  };
}

export type TransactionStage =
  | "PENDING"
  | "PROPOSING"
  | "COMMITTING"
  | "REVEALING"
  | "ACCEPTED"
  | "FINALIZED"
  | "CANCELED"
  | "UNDETERMINED"
  | "READY_TO_FINALIZE"
  | "VALIDATORS_TIMEOUT"
  | "LEADER_TIMEOUT"
  | "UNKNOWN";

export type TransactionProgress = {
  hash: string;
  status: TransactionStage;
  statusCode?: number;
};

const TERMINAL_FAILURES = new Set([
  "CANCELED",
  "UNDETERMINED",
  "VALIDATORS_TIMEOUT",
  "LEADER_TIMEOUT",
]);

export async function getTransactionProgress(client: any, hash: string): Promise<TransactionProgress> {
  try {
    const tx = await client.getTransaction({ hash });
    const status = String(tx?.statusName ?? tx?.status ?? "UNKNOWN").toUpperCase() as TransactionStage;
    return {
      hash,
      status,
      statusCode: typeof tx?.status === "number" ? tx.status : tx?.statusCode,
    };
  } catch {
    return { hash, status: "UNKNOWN" };
  }
}

export async function waitFinalized(
  client: any,
  hash: string,
  onProgress?: (progress: TransactionProgress) => void,
) {
  // Do not use the SDK's short default wait here. GenLayer consensus can
  // legitimately remain in PROPOSING/COMMITTING/REVEALING for a while.
  // Poll the lightweight transaction endpoint and keep the UI informed.
  const intervalMs = 5000;
  const maxChecks = 180; // 15 minutes

  for (let attempt = 0; attempt < maxChecks; attempt += 1) {
    const progress = await getTransactionProgress(client, hash);
    onProgress?.(progress);

    if (progress.status === "FINALIZED") {
      const { TransactionStatus } = await import("genlayer-js/types");
      return client.waitForTransactionReceipt({
        hash,
        status: TransactionStatus.FINALIZED,
        interval: intervalMs,
        retries: 12,
      });
    }

    if (TERMINAL_FAILURES.has(progress.status)) {
      throw new Error(`Transaction ended with status ${progress.status}.`);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `Transaction is still processing. Hash: ${hash}. The network did not reach FINALIZED within 15 minutes.`,
  );
}

export function contractAddress() {
  return CONTRACT_ADDRESS;
}

export function networkName() {
  return NETWORK;
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
