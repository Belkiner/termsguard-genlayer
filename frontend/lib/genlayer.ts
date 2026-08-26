import { createClient } from "genlayer-js";
import {
  localnet,
  studionet,
  testnetAsimov,
  testnetBradbury,
} from "genlayer-js/chains";
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

function getChain() {
  switch (NETWORK) {
    case "localnet":
      return localnet;

    case "testnetAsimov":
      return testnetAsimov;

    case "testnetBradbury":
      return testnetBradbury;

    case "studionet":
    default:
      return studionet;
  }
}

export function isLive() {
  return Boolean(CONTRACT_ADDRESS);
}

function getContractAddress(): ContractAddress {
  if (!/^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS)) {
    throw new Error(
      "NEXT_PUBLIC_CONTRACT_ADDRESS must be a valid 0x contract address.",
    );
  }

  return CONTRACT_ADDRESS as ContractAddress;
}

export async function readContract(
  functionName: string,
  args: CalldataEncodable[] = [],
) {
  if (!isLive()) {
    throw new Error("TermsGuard is running in Demo Mode.");
  }

  const chain = getChain();

  const client = createClient({
    chain,
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

  const chain = getChain();

  const client = createClient({
    chain,
    account: account as `0x${string}`,
    provider: window.ethereum,
  });

  await client.connect(NETWORK);

  const hash = await client.writeContract({
    address: getContractAddress(),
    functionName,
    args,
    value: BigInt(0),
  });

  return { hash, client };
}

export async function waitFinalized(client: any, hash: string) {
  const { TransactionStatus } = await import("genlayer-js/types");

  return client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.FINALIZED,
  });
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