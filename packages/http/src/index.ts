export * from './http-client';
export * from './egress-route';
export * from './messages';
// The single axios surface: consumers import these TYPES from @tepegoz/http, never 'axios' directly,
// so no other package takes a (phantom) direct dependency on the vendor lib.
export type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
