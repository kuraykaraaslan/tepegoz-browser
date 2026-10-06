import { AxiosError, type AxiosAdapter, type AxiosResponse } from 'axios';

export function axiosError(opts: {
  message?: string;
  code?: string;
  status?: number;
  data?: unknown;
}): AxiosError {
  const response =
    opts.status === undefined
      ? undefined
      : ({
          status: opts.status,
          data: opts.data,
          statusText: '',
          headers: {},
          config: {},
        } as AxiosResponse);
  return new AxiosError(opts.message ?? 'boom', opts.code, undefined, undefined, response);
}

/** A stub axios adapter that fails the first `fails` calls with a 429 (with `data`), then returns 200. */
export function stub429Then200(
  fails: number,
  data: unknown,
): { adapter: AxiosAdapter; calls: () => number } {
  let calls = 0;
  const adapter: AxiosAdapter = (config) => {
    calls += 1;
    if (calls <= fails) {
      const response = {
        status: 429,
        statusText: 'Too Many Requests',
        headers: {},
        data,
        config,
      } as AxiosResponse;
      return Promise.reject(new AxiosError('rate limited', undefined, config, undefined, response));
    }
    return Promise.resolve({
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { ok: true },
      config,
    } as AxiosResponse);
  };
  return { adapter, calls: () => calls };
}
