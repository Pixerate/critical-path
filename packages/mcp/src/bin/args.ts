export interface CliOptions {
  db?: string;
  api?: string;
  headers: string[];
  help?: boolean;
  tools?: string[];
  toolsets?: string[];
  readOnly?: boolean;
  /** `skills list` / `skills install`. */
  command?: 'skills';
  subcommand?: string;
  dir?: string;
  force?: boolean;
}

const list = (value: string) => value.split(',').map((s) => s.trim()).filter(Boolean);

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { headers: [] };
  if (args[0] === 'skills') {
    options.command = 'skills';
    options.subcommand = args[1] && !args[1].startsWith('-') ? args[1] : 'list';
  }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--db' && args[i + 1]) {
      options.db = args[++i];
    } else if (arg === '--api' && args[i + 1]) {
      options.api = args[++i];
    } else if (arg === '--header' && args[i + 1]) {
      options.headers.push(args[++i]);
    } else if (arg === '--tools' && args[i + 1]) {
      options.tools = list(args[++i]);
    } else if (arg === '--toolsets' && args[i + 1]) {
      options.toolsets = list(args[++i]);
    } else if (arg === '--read-only') {
      options.readOnly = true;
    } else if (arg === '--dir' && args[i + 1]) {
      options.dir = args[++i];
    } else if (arg === '--force') {
      options.force = true;
    }
  }
  return options;
}

/**
 * Builds request headers for `--api` mode from repeated `--header "Name: value"` flags and the
 * `CRITICAL_PATH_API_TOKEN` environment variable (sent as `Authorization: Bearer <token>`).
 * Prefer the environment variable for secrets: command-line flags are visible in process lists.
 */
export function buildApiHeaders(headerFlags: string[], env: Record<string, string | undefined>): Record<string, string> {
  const headers: Record<string, string> = {};
  if (env.CRITICAL_PATH_API_TOKEN) {
    headers['Authorization'] = `Bearer ${env.CRITICAL_PATH_API_TOKEN}`;
  }
  for (const flag of headerFlags) {
    const separator = flag.indexOf(':');
    if (separator <= 0) {
      throw new Error(`Invalid --header "${flag}". Expected "Name: value".`);
    }
    headers[flag.slice(0, separator).trim()] = flag.slice(separator + 1).trim();
  }
  return headers;
}

/** True when credentials would be sent in cleartext to a host other than this machine. */
export function isInsecureRemote(apiUrl: string): boolean {
  const url = new URL(apiUrl);
  const localHosts = ['localhost', '127.0.0.1', '[::1]'];
  return url.protocol === 'http:' && !localHosts.includes(url.hostname) && !url.hostname.endsWith('.localhost');
}
