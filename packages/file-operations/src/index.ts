export {
  registerFileOperations,
  resetFileOperationsForTest,
  FILE_OP_REQUIRED_MODE,
  FILE_GRANT_TOOL_IDS,
  type FileOperationsDeps,
} from './file-operations';
export { FileAccessPolicy, type FileAccessDecision } from './file-access-policy';
export {
  type FileSystemHost,
  type GrantStore,
  type DirEntry,
  type FileStat,
  type FileEncoding,
} from './fs-host';
