import { Context, type Effect, type Stream } from "effect";

export interface ConstructorInputInfo {
  readonly name: string;
  readonly type: string;
}

export interface CompiledContractInfo {
  readonly name: string;
  readonly constructorInputs: readonly ConstructorInputInfo[];
}

export interface CompileResult {
  readonly foundryAvailable: boolean;
  readonly contracts: readonly CompiledContractInfo[];
}

export interface DeployRecordRow {
  readonly id: string;
  readonly projectId: string;
  readonly network: string;
  readonly contractName: string;
  readonly address: string;
  readonly txHash: string;
  readonly blockNumber: number | null;
  readonly constructorArgsJson: string | null;
  readonly deployedAt: string;
}

export interface DevnetStatusInfo {
  readonly running: boolean;
  readonly port: number | null;
  readonly chainId: number;
  readonly url: string | null;
}

export interface DeployContractInput {
  readonly projectId: string;
  readonly contractName: string;
  readonly constructorArgs: readonly unknown[];
  readonly network: string;
}

export interface CodegenResultInfo {
  readonly written: readonly string[];
  readonly skipped: readonly string[];
  readonly frontendMissing: boolean;
}

export interface FrontendStatusInfo {
  readonly running: boolean;
  readonly url: string | null;
  readonly pm: string | null;
  readonly projectId: string | null;
}

export interface AbiParamInfo {
  readonly name: string;
  readonly type: string;
}

export interface ContractFunctionInfo {
  readonly name: string;
  readonly stateMutability: string;
  readonly inputs: readonly AbiParamInfo[];
  readonly outputs: readonly AbiParamInfo[];
}

export interface ContractFunctionsResult {
  readonly reads: readonly ContractFunctionInfo[];
  readonly writes: readonly ContractFunctionInfo[];
}

export interface ContractReadInput {
  readonly projectId: string;
  readonly contractName: string;
  readonly address: string;
  readonly network: string;
  readonly functionName: string;
  readonly args: readonly unknown[];
}

export interface ContractWriteInput extends ContractReadInput {
  /** Native value in wei (string) for payable functions. */
  readonly value?: string;
}

export interface ContractWriteResult {
  readonly txHash: string;
  readonly blockNumber: number | null;
  readonly status: string;
}

/** Ordered stages of the one-click cloud deploy. */
export type CloudDeployStage =
  | "deploy-contract"
  | "convex"
  | "build"
  | "vercel"
  | "done";

/** A single progress event streamed during {@link MonadDeployServiceShape.cloudDeploy}. */
export interface CloudDeployStepInfo {
  readonly stage: CloudDeployStage;
  readonly status: "started" | "succeeded" | "failed";
  /** A CLI log line, when this event carries one. */
  readonly log: string | null;
  /** Set on the `convex` stage success. */
  readonly convexUrl: string | null;
  /** Set on the `deploy-contract` stage success. */
  readonly contractAddress: string | null;
  /** The public Vercel URL, set on the `done` event. */
  readonly shareUrl: string | null;
}

/** Which stages to run; omitted/undefined fields default to enabled. */
export interface CloudDeployStages {
  readonly contract: boolean;
  readonly convex: boolean;
  /** Build the frontend and publish it to Vercel. */
  readonly publish: boolean;
}

export interface CloudDeployInput {
  readonly projectId: string;
  readonly contractName: string;
  readonly constructorArgs: readonly unknown[];
  readonly stages?: CloudDeployStages;
}

export interface MonadDeployServiceShape {
  /** Compile the project's Foundry contracts and list what's deployable. */
  readonly compile: (projectId: string) => Effect.Effect<CompileResult, Error>;

  /** Deploy a compiled contract, signing with the most recent burner wallet. */
  readonly deploy: (
    input: DeployContractInput,
  ) => Effect.Effect<DeployRecordRow, Error>;

  /** Past deploys for a project, newest first. */
  readonly list: (
    projectId: string,
  ) => Effect.Effect<readonly DeployRecordRow[], Error>;

  readonly devnetStart: () => Effect.Effect<DevnetStatusInfo, Error>;
  readonly devnetStop: () => Effect.Effect<void, Error>;
  readonly devnetStatus: () => Effect.Effect<DevnetStatusInfo, Error>;

  /** Rewrite the frontend bindings from deploy history + compiled ABIs. */
  readonly regenerateBindings: (
    projectId: string,
  ) => Effect.Effect<CodegenResultInfo, Error>;

  /** Start / stop / inspect the project's frontend dev server. */
  readonly frontendStart: (
    projectId: string,
  ) => Effect.Effect<FrontendStatusInfo, Error>;
  readonly frontendStop: () => Effect.Effect<FrontendStatusInfo, Error>;
  readonly frontendStatus: () => Effect.Effect<FrontendStatusInfo, Error>;

  /** ABI functions (read vs write) for a deployed contract, by name. */
  readonly contractFunctions: (
    projectId: string,
    contractName: string,
  ) => Effect.Effect<ContractFunctionsResult, Error>;

  /** Call a view/pure function; returns the JSON-stringified result. */
  readonly contractRead: (
    input: ContractReadInput,
  ) => Effect.Effect<{ readonly result: string }, Error>;

  /** Simulate + send a state-changing call, signed with the burner wallet. */
  readonly contractWrite: (
    input: ContractWriteInput,
  ) => Effect.Effect<ContractWriteResult, Error>;

  /**
   * One-click cloud deploy: contract → testnet, Convex dev deployment, frontend
   * build, Vercel publish. Emits one progress event per state transition.
   */
  readonly cloudDeploy: (
    input: CloudDeployInput,
  ) => Stream.Stream<CloudDeployStepInfo, Error>;

  /** Whether Convex / Vercel are already logged in on this machine. */
  readonly cloudStatus: () => Effect.Effect<CloudConnectionStatus, Error>;

  /** Drive the Convex device-flow login, streaming progress to the renderer. */
  readonly connectConvex: (
    projectId: string,
  ) => Stream.Stream<ConnectEvent, Error>;

  /** Drive the Vercel device-flow login, streaming progress to the renderer. */
  readonly connectVercel: () => Stream.Stream<ConnectEvent, Error>;

  /** The last published (shareable) app URL for a project, if any. */
  readonly publishedUrl: (
    projectId: string,
  ) => Effect.Effect<PublishedAppInfo | null, Error>;
}

export interface PublishedAppInfo {
  readonly url: string;
  readonly deploymentUrl: string | null;
  readonly updatedAt: string;
}

export interface CloudConnectionStatus {
  readonly convex: boolean;
  readonly vercel: boolean;
}

/** One progress event from a Convex/Vercel device-flow login. */
export interface ConnectEvent {
  readonly type: "url" | "log" | "done";
  /** The auth URL to open in the browser (on a `url` event). */
  readonly url: string | null;
  /** A CLI log line (on a `log` event). */
  readonly log: string | null;
  /** Whether login succeeded (on a `done` event). */
  readonly ok: boolean;
}

export class MonadDeployService extends Context.Tag(
  "memoize/MonadDeployService",
)<MonadDeployService, MonadDeployServiceShape>() {}
