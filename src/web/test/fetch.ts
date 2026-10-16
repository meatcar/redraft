import { afterEach } from "bun:test";

type Handler = (request: Request) => Response | Promise<Response>;

const realFetch = globalThis.fetch;

/** Routes fetch to a handler and rejects aborted requests like the real fetch does. */
export function stubFetch(handler: Handler) {
  const requests: Request[] = [];
  const stub = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    const request = new Request(new URL(url, "http://localhost/"), init);
    requests.push(request);
    return new Promise<Response>((resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError")),
      );
      Promise.resolve(handler(request)).then(resolve, reject);
    });
  };
  globalThis.fetch = Object.assign(stub, { preconnect: realFetch.preconnect });
  return requests;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

export const json = (body: unknown, status = 200) => Response.json(body, { status });
