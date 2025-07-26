/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ensure React Strict Mode is enabled (default in Next.js 13+)
  reactStrictMode: true,
  
  // Legacy behavior for webpack configuration
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Ensure client-side modules don't get bundled on the server
    if (isServer) {
      config.externals = config.externals || []
      config.externals.push(
        // Add patterns for problematic client-side modules
        'react-data-table-component',
        // Exclude any modules that might use window/document
        function ({ context, request }, callback) {
          // Exclude client-side only modules from server bundle
          if (/^(react-data-table-component|styled-components)/.test(request)) {
            return callback(null, 'commonjs ' + request)
          }
          callback()
        }
      )
    }
    
    // Provide fallbacks for Node.js core modules in client-side bundles
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        url: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        os: false,
        path: false,
      }
    }
    
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