/** @doc Zone routing helpers — locale zone aliases removed; kept as no-op stubs so existing call sites keep compiling. */

export function stripZonePrefix(pathname: string): string {
  return pathname || "/";
}

export function pathForZone(path: string, _currentPathname: string): string {
  return path;
}
