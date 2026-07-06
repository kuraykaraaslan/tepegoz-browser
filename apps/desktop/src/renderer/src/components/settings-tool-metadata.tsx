import { Badge } from '@tepegoz/ui';
import type { AIAdaptorAction } from '@tepegoz/desktop-ipc';

export interface ToolMetadataLabels {
  schema: string;
  idempotency: string;
}

function hasSchema(inputSchema: unknown): boolean {
  if (inputSchema === undefined || inputSchema === null) return false;
  if (typeof inputSchema !== 'object') return true;
  return Object.keys(inputSchema).length > 0;
}

export function ToolMetadataBadges({
  action,
  labels,
}: {
  action: AIAdaptorAction;
  labels: ToolMetadataLabels;
}) {
  return (
    <span className="ml-2 inline-flex flex-wrap items-center gap-1 align-middle">
      <Badge variant="neutral" size="sm">
        {action.category ?? action.source}
      </Badge>
      {hasSchema(action.inputSchema) && (
        <Badge variant="neutral" size="sm">
          {labels.schema}
        </Badge>
      )}
      {action.requiresIdempotencyKey && (
        <Badge variant="warning" size="sm">
          {labels.idempotency}
        </Badge>
      )}
    </span>
  );
}
