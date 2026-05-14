/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // No app-level cap on attachment uploads; this is the Next.js framework
      // limit on the entire server-action payload (file + form fields).
      bodySizeLimit: '2gb',
      // Reverse-proxy hosts that must pass the Server Action CSRF Origin check.
      // Without these listed, Next.js 16 rejects POSTs whose Origin doesn't
      // match the request Host — a common silent-failure mode when running
      // behind Coolify/Caddy. Add every public hostname the app is served on.
      allowedOrigins: [
        'project.dgsmart.gr',
        '*.dgsmart.gr',
        'localhost:3000',
      ],
    },
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'i.pravatar.cc' },
      { protocol: 'https', hostname: 'dgsoft.b-cdn.net' },
      { protocol: 'https', hostname: '*.bunnycdn.com' },
      { protocol: 'https', hostname: 'graph.microsoft.com' },
    ],
    unoptimized: false,
    formats: ['image/avif', 'image/webp'],
  },
  headers: async () => {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
