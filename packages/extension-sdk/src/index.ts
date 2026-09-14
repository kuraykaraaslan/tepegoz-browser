export {
  EXTENSION_ID_RE,
  ExtensionSurfaceKindSchema,
  ExtensionManifestSchema,
  McpServerDeclSchema,
  AdapterSubprocessDeclSchema,
  AdapterSubprocessProtocolSchema,
  defineExtension,
  validateManifest,
  type ExtensionSurfaceKind,
  type ExtensionManifest,
  type McpServerDecl,
  type AdapterSubprocessDecl,
  type AdapterSubprocessProtocol,
} from './manifest';

export {
  capability,
  defineCapabilities,
  type ExtensionCapability,
  type ExtensionCapabilityDef,
  type ExtensionCapabilitySet,
} from './capabilities';

export {
  defineActionInterceptors,
  type ActionType,
  type ActionContext,
  type ActionInterceptor,
  type ActionInterceptorDef,
  type ActionInterceptorSet,
} from './action-interceptors';
