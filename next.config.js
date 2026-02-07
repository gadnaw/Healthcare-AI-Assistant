/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React strict mode for development, careful in production
  reactStrictMode: true,
  
  // Security headers configuration
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()'
          }
        ]
      },
      // API routes get stricter CSP
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self' https://*.openai.azure.com https://*.supabase.co; frame-ancestors 'none';"
          },
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate'
          }
        ]
      },
      // Health check endpoint
      {
        source: '/api/health',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate'
          }
        ]
      }
    ];
  },

  // CORS configuration for API routes
  async rewrites() {
    return [
      {
        source: '/api/external/:path*',
        destination: 'https://api.external-service.com/:path*'
      }
    ];
  },

  // Image optimization security
  images: {
    // Restrict image sources in production
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co'
      },
      {
        protocol: 'https',
        hostname: '*.openai.azure.com'
      }
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256]
  },

  // Compiler optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
  },

  // Production-only features
  experimental: {
    serverMinification: true,
    serverSourceMaps: false
  },

  // Logging configuration
  logging: {
    fetches: {
      fullUrl: false
    }
  },

  // TypeScript and ESLint configuration
  typescript: {
    ignoreBuildErrors: false,
    tsconfigPath: 'tsconfig.json'
  },
  eslint: {
    ignoreDuringBuilds: false,
    dirs: ['src', 'scripts']
  }
};

module.exports = nextConfig;
