import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'A-Sisyphus — Modern Project Management',
  description: 'Premium project management with Microsoft 365 integration',
  // Local /public asset — avoids server-side fetch of an external CDN that
  // can fail with ENOTFOUND inside locked-down containers.
  icons: {
    icon: [{ url: '/sisyphus-icon.svg', type: 'image/svg+xml' }],
    shortcut: '/sisyphus-icon.svg',
    apple: '/sisyphus-icon.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="el">
      <body>{children}</body>
    </html>
  );
}
