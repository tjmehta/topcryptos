const path = require('path')

/** @type {import('next').NextConfig} */
module.exports = {
  webpack: (config) => {
    config.resolve = config.resolve || {}
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      'fast-abort-controller': path.resolve(__dirname, 'shims/fast-abort-controller.cjs'),
    }
    return config
  },
}