import { Context, type Effect } from "effect";

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
}

export class MonadDeployService extends Context.Tag(
  "memoize/MonadDeployService",
)<MonadDeployService, MonadDeployServiceShape>() {}
