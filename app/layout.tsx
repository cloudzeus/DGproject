import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'A-Sisyphus — Modern Project Management',
  description: 'Premium project management with Microsoft 365 integration',
  icons: {
    icon: [{ url: 'https://dgsoft.b-cdn.net/company/sisyphusIconWhite.svg', type: 'image/svg+xml' }],
    shortcut: 'https://dgsoft.b-cdn.net/company/sisyphusIconWhite.svg',
    apple: 'https://dgsoft.b-cdn.net/company/sisyphusIconWhite.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="el">
      <body>{children}</body>
    </html>
  );
}
