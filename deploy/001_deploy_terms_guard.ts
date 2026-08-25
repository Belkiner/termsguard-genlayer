import { deployContract } from "genlayer";

export default async function main(client: any) {
  return await deployContract(client, "contracts/terms_guard.py", []);
}
