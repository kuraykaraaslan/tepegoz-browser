export {
  encodeFrame,
  decodeFrame,
  isRpcEvent,
  isRpcResponseOk,
  LineBuffer,
  MAX_LINE_BYTES,
  RpcResponseOkSchema,
  RpcResponseErrSchema,
  RpcResponseSchema,
  RpcEventSchema,
  RpcInboundSchema,
  type RpcRequest,
  type RpcResponseOk,
  type RpcResponseErr,
  type RpcResponse,
  type RpcEvent,
  type RpcInbound,
} from './rpc-envelope';

export type { ChildProcessLike, SpawnFn } from './types';

export {
  ProcessSupervisor,
  type ProcessSupervisorConfig,
  type ProcessSupervisorDeps,
  type SupervisorState,
} from './process-supervisor';
