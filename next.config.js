/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // Webpack configuration for development
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      // File watching settings for Windows
      config.watchOptions = {
        poll: false, // Use native file watching (faster)
        aggregateTimeout: 300,
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/.next/**',
          '**/__pycache__/**',
          '**/.vscode/**',
          '**/dist/**',
          '**/build/**',
        ],
      };
    }
    return config;
  },
  
  // Experimental features
  experimental: {
    optimizePackageImports: ['@solana/web3.js'],
  },
  
  // Standard timeout
  staticPageGenerationTimeout: 60,
  
  // Disable powered by header
  poweredByHeader: false,
}

module.exports = nextConfig

