/** @doc Ready-made API apps — the user brings their own key and the app works.
 *
 *  Each entry describes one public REST service: where the user gets a key,
 *  how the key is sent, and the real endpoints exposed as assistant tools.
 */
export type ApiAppAuth = {
  /** `path` means the key is substituted into a `{key}` slot in the path. */
  type: "header" | "query" | "path";
  name: string;
  prefix?: string;
};

export type ApiAppParam = {
  name: string;
  in: "query" | "path" | "body";
  required: boolean;
  description: string;
};

export type ApiAppTool = {
  name: string;
  description: string;
  method: "GET" | "POST";
  path: string;
  params: ApiAppParam[];
};

export type ApiAppCategory =
  | "search"
  | "weather"
  | "media"
  | "finance"
  | "ai"
  | "data"
  | "comms"
  | "dev";

/** One named credential the service asks for (its own label, not a generic key). */
export type ApiAppCredential = {
  name: string;
  label: string;
  description?: string;
  example?: string;
  secret?: boolean;
};

/** How the saved credentials travel on every request, e.g. `{ "x-api-key": "${apiKey}" }`. */
export type ApiAppAuthTemplate = {
  headers?: Record<string, string>;
  params?: Record<string, string>;
};

export type ApiApp = {
  id: string;
  name: string;
  category: ApiAppCategory;
  description: string;
  docsUrl: string;
  keyUrl: string;
  baseUrl: string;
  auth?: ApiAppAuth;
  /** Named fields shown in the setup form; falls back to a single key field. */
  credentials?: ApiAppCredential[];
  authTemplate?: ApiAppAuthTemplate;
  /** Credentials go out as HTTP Basic (username/password style services). */
  basic?: boolean;
  logo: string;
  tools: ApiAppTool[];
};
