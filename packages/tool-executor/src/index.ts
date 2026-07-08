export {
  HIDDEN_PLACEHOLDER,
  sanitizeText,
  sanitizeSegments,
  wrapUntrustedContent,
} from './content-sanitizer.js';
export type { SanitizeResult, ContentSegment } from './content-sanitizer.js';
export {
  sanitizeContent,
  detectThreats,
  wrapUserRequest,
  SECURITY_PREAMBLE,
  TRUSTED_TASK_OPEN,
  TRUSTED_TASK_CLOSE,
} from './content-guard.js';
export type { ThreatKind, Threat, GuardResult } from './content-guard.js';
export {
  INTERACTABLE_ROLES,
  isInteractableRole,
  isEditableRole,
  finalizeElements,
  renderElementsText,
  sanitizeLabel,
  MAX_INTERACTABLE_ELEMENTS,
  MAX_ELEMENT_LABEL,
  MAX_ATTR_VALUE,
  ATTR_ALLOWLIST,
} from './interactable.js';
export type { InteractableElement, RawInteractable } from './interactable.js';
export { parseDomTree, markNewElements } from './dom-tree.js';
export type { DomTreeResult, DomTreeNode, ParsedDomTree } from './dom-tree.js';
export { resolveNodePath } from './dom-path.js';
export type { PathNode, NodePath, PathSegment } from './dom-path.js';
