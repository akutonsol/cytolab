import './globals.css';
import { Inter } from 'next/font/google';
import { Providers } from './providers';
import LenisProvider from '@/components/providers/LenisProvider';

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
    <html lang="en" className={inter.variable} data-theme="indigo" suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before paint to avoid a flash of the default. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('cytolab-theme');if(t&&['indigo','emerald','violet','rose','ocean','sky','cobalt','slate','dark'].indexOf(t)>-1)document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <Providers>
          <LenisProvider>{children}</LenisProvider>
        </Providers>
      </body>
    </html>
  );
}
