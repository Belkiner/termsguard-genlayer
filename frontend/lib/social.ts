import {createClient} from "genlayer-js";
import {localnet, studionet, testnetAsimov, testnetBradbury} from "genlayer-js/chains";
import type {CalldataEncodable} from "genlayer-js/types";
import {networkName} from "./genlayer";

export const socialAddress = process.env.NEXT_PUBLIC_SOCIAL_CONTRACT_ADDRESS?.trim() || "";
export const socialConfigured = /^0x[0-9a-fA-F]{40}$/.test(socialAddress);
const chains = {localnet, studionet, testnetAsimov, testnetBradbury};
function address(): `0x${string}` {
  if (!socialConfigured) throw new Error("The separate social contract is not configured yet.");
  return socialAddress as `0x${string}`;
}
export async function socialRead(name:string, args:CalldataEncodable[] = []) {
  const value = await createClient({chain:chains[networkName()]}).readContract({address:address(),functionName:name,args});
  return typeof value === "string" ? JSON.parse(value) : value;
}
export async function socialWrite(name:string,args:CalldataEncodable[]) {
  if (!window.ethereum) throw new Error("Open this page in a browser with a compatible wallet.");
  const accounts = await window.ethereum.request({method:"eth_requestAccounts"});
  if (!accounts?.[0]) throw new Error("Wallet connection was cancelled.");
  const client=createClient({chain:chains[networkName()],account:accounts[0],provider:window.ethereum as any});
  await client.connect(networkName());
  const hash=await client.writeContract({address:address(),functionName:name,args,value:BigInt(0)});
  return String(hash);
}
