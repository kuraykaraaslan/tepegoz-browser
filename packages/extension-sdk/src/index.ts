export {
  EXTENSION_ID_RE,
  ExtensionSurfaceKindSchema,
  ExtensionManifestSchema,
  McpServerDeclSchema,
  defineExtension,
  validateManifest,
  type ExtensionSurfaceKind,
  type ExtensionManifest,
  type McpServerDecl,
} from './manifest';

export {
  capability,
  defineCapabilities,
  type ExtensionCapability,
  type ExtensionCapabilityDef,
  type ExtensionCapabilitySet,
} from './capabilities';
