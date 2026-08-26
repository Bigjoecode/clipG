import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import type { NextConfig } from 'next';

const workspaceEnvironmentPath = resolve(process.cwd(), '../../.env');
if (existsSync(workspaceEnvironmentPath)) {
  process.loadEnvFile(workspaceEnvironmentPath);
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ['@clipgenius/ui'],
};

export default nextConfig;
