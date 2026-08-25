let sdkPromise: Promise<typeof import("genlayer-js")> | undefined;

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "";
const NETWORK = process.env.NEXT_PUBLIC_NETWORK ?? "studionet";

async function sdk() {
  sdkPromise ??= import("genlayer-js");
  return sdkPromise;
}

async function getChain() {
  const chains = await import("genlayer-js/chains");
  const map: Record<string, unknown> = {
    studionet: chains.studionet,
    testnetBradbury: chains.testnetBradbury,
    testnetAsimov: chains.testnetAsimov,
    localnet: chains.localnet,
  };
  return map[NETWORK] ?? chains.studionet;
}

export function isLive() {
  return Boolean(CONTRACT_ADDRESS);
}

export async function readContract(functionName: string, args: unknown[] = []) {
  if (!isLive()) throw new Error("TermsGuard is running in Demo Mode.");
  const { createClient } = await sdk();
  const chain = await getChain();
  const client = createClient({ chain });
  return client.readContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    stateStatus: "accepted",
  });
}

export async function writeContract(functionName: string, args: unknown[] = []) {
  if (!isLive()) throw new Error("Deploy the contract and set NEXT_PUBLIC_CONTRACT_ADDRESS first.");
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No browser wallet provider detected.");
  }

  const { createClient } = await sdk();
  const chain = await getChain();
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  const account = accounts?.[0];
  if (!account) throw new Error("Wallet connection was cancelled.");

  const client = createClient({
    chain,
    account,
    provider: window.ethereum,
  });

  await client.connect(NETWORK);
  const hash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    value: BigInt(0),
  });

  return { hash, client };
}

export async function waitFinalized(client: any, hash: string) {
  const { TransactionStatus } = await sdk();
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
      request: (args: { method: string; params?: unknown[] }) => Promise<any>;
    };
  }
}
