const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
  },
  transpilePackages: ['@propmetrik/e-sign-ui'],
  webpack: (config) => {
    config.resolve.alias['@propmetrik/e-sign-ui'] = path.resolve(__dirname, '../packages/e-sign-ui/src');
    return config;
  },
}

module.exports = nextConfig
