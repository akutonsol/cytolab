import './globals.css';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { Providers } from './providers';

// Self-hosted at build time; exposed as the --font-jakarta CSS variable that
// globals.css folds into --font-family (with Inter / system-ui fallbacks).
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
});

export const metadata = {
  title: 'Cytolab',
  description: 'Cytolab LIMS',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
