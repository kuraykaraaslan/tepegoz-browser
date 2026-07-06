export interface WebSearchInput {
  query: string;
  maxResults?: number | undefined;
}

export interface WebSearchResolvedInput {
  query: string;
  maxResults: number;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet?: string | undefined;
  source: 'duckduckgo' | 'provider';
}

export interface WebFetchInput {
  url: string;
  maxBytes?: number | undefined;
}

export interface WebFetchResolvedInput {
  url: string;
  maxBytes: number;
}

export interface WebFetchResult {
  url: string;
  finalUrl: string;
  status: number;
  title?: string | undefined;
  mimeType?: string | undefined;
  text: string;
  truncated: boolean;
}

export interface WebToolsHost {
  search(input: WebSearchResolvedInput): Promise<WebSearchResult[]>;
  fetch(input: WebFetchResolvedInput): Promise<WebFetchResult>;
}

export const DEFAULT_WEB_SEARCH_RESULTS = 5;
export const MAX_WEB_SEARCH_RESULTS = 10;
export const DEFAULT_WEB_FETCH_BYTES = 200_000;
export const MAX_WEB_FETCH_BYTES = 1_000_000;
