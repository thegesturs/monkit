import {
  type Abi,
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { getNetwork, type NetworkId } from "./networks.js";

export interface DeployContractOptions {
  readonly networkId: NetworkId;
  readonly privateKey: Hex;
  readonly abi: Abi;
  readonly bytecode: Hex;
  readonly args: readonly unknown[];
}

export interface DeployContractResult {
  readonly txHash: Hex;
  readonly address: Hex;
  readonly blockNumber: bigint | null;
}

function chainFor(networkId: NetworkId) {
  const net = getNetwork(networkId);
  return {
    id: net.chainId,
    name: net.name,
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [net.rpcUrl] } },
  } as const;
}

/**
 * Deploy a compiled contract with a burner key. Plain viem (no Effect) so the
 * server layer can wrap it however it likes. Waits for the receipt so callers
 * get the deployed address + block in one shot.
 */
export async function deployContract(
  opts: DeployContractOptions,
): Promise<DeployContractResult> {
  const net = getNetwork(opts.networkId);
  const chain = chainFor(opts.networkId);
  const account = privateKeyToAccount(opts.privateKey);

  const wallet = createWalletClient({
    account,
    chain,
    transport: http(net.rpcUrl),
  });
  const publicClient = createPublicClient({
    chain,
    transport: http(net.rpcUrl),
  });

  const txHash = await wallet.deployContract({
    abi: opts.abi,
    bytecode: opts.bytecode,
    args: opts.args as never,
  });

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
  });

  if (receipt.contractAddress == null) {
    throw new Error("Deployment receipt did not include a contract address");
  }

  return {
    txHash,
    address: receipt.contractAddress,
    blockNumber: receipt.blockNumber ?? null,
  };
}
