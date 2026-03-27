export function log(status: 'OK' | 'FAIL' | 'INFO' | 'IGNORE', restaurant: string, action: string, detail?: string): void {
  const entry: Record<string, string> = {
    ts: new Date().toISOString(),
    status,
    restaurant,
    action,
  };
  if (detail) entry.detail = detail;
  console.log(JSON.stringify(entry));
}
