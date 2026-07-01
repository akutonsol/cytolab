import './globals.css';
import { Inter } from 'next/font/google';
import { Providers } from './providers';

// Self-hosted at build time; exposed as the --font-inter CSS variable that
// globals.css folds into --font-family (with system-ui fallbacks).
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata = {
  title: 'Cytolab',
  description: 'Cytolab LIMS',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
