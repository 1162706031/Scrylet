import { schemas } from "../../contracts/public.cjs";
import type { ContractMap } from "../../contracts/index.js";
export { schemas };
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 0,
  ) {
    super(message);
  }
}
export async function response(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("X-Snap-Client", "mobile");
  const result = await fetch(path, {
    ...init,
    headers,
    credentials: "same-origin",
    redirect: "error",
  });
  if (!result.ok) {
    let value: unknown;
    try {
      value = await result.json();
    } catch {
      value = null;
    }
    const error = schemas.publicError.safeParse(value);
    if (error.success)
      throw new ApiError(error.data.code, error.data.error, result.status);
    throw new ApiError(
      "REQUEST_FAILED",
      result.status === 401 ? "请重新配对" : "暂时无法连接电脑，请稍后重试",
      result.status,
    );
  }
  return result;
}
export async function json(
  path: string,
  value?: unknown,
  method = value === undefined ? "GET" : "POST",
  signal?: AbortSignal,
): Promise<unknown> {
  const result = await response(path, {
    method,
    ...(value === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(value),
        }),
    ...(signal ? { signal } : {}),
  });
  return result.json();
}
export async function read<
  K extends Exclude<keyof ContractMap, "nativeEvent" | "processMessage">,
>(
  kind: K,
  path: string,
  value?: unknown,
  method?: string,
): Promise<ContractMap[K]> {
  const parsed = schemas[kind].safeParse(await json(path, value, method));
  if (!parsed.success)
    throw new ApiError(
      "PROTOCOL_MISMATCH",
      "电脑与手机的数据版本不一致，请刷新页面",
    );
  return parsed.data;
}
export const messageOf = (error: unknown): string =>
  error instanceof ApiError
    ? error.message
    : "暂时无法完成操作，原有内容已保留";
// getRandomValues also works at the plain HTTP LAN origin used by paired phones.
export const id = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(20)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
export function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Keep this page usable without persistent storage. */
  }
}
