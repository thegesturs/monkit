import {
  type Abi,
  createPublicClient,
  createWalletClient,
  encodeDeployData,
  formatEther,
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

  // Preflight gas check. Monad reserves the FULL gas limit × maxFeePerGas up
  // front (not gas actually used), so a large contract can need more than a
  // small balance even if the deploy would only spend a fraction. We fail
  // here with exact numbers instead of letting the node return an opaque
  // "insufficient balance". `estimateGas` doesn't require a funded account, so
  // this is safe to run before we know the wallet can pay.
  const data = encodeDeployData({
    abi: opts.abi,
    bytecode: opts.bytecode,
    args: opts.args as never,
  });
  const [gas, fees, balance] = await Promise.all([
    publicClient.estimateGas({ account, data }),
    publicClient.estimateFeesPerGas(),
    publicClient.getBalance({ address: account.address }),
  ]);
  const maxFeePerGas = fees.maxFeePerGas ?? 0n;
  const required = gas * maxFeePerGas;
  if (balance < required) {
    const mon = (wei: bigint) => Number(formatEther(wei)).toFixed(4);
    throw new Error(
      `Insufficient balance for gas. Deploying this contract needs about ` +
        `${mon(required)} MON, but ${account.address} has ${mon(balance)} MON ` +
        `on ${net.name}. Add more test MON and try again.`,
    );
  }

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
