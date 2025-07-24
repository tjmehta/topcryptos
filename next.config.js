/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ensure React Strict Mode is enabled (default in Next.js 13+)
  reactStrictMode: true,
  
  // Legacy behavior for webpack configuration
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Return the modified config
    return config
  },
  
  // Experimental features (if needed)
  experimental: {
    // Add any experimental features here if needed
  },
  
  // Image domains for next/image (if using external images)
  images: {
    // Configure image domains if needed
    domains: [],
  },
}

module.exports = nextConfig