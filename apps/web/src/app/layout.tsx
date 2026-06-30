import { Providers } from './providers';

export const metadata = {
  title: 'Cytolab',
  description: 'Cytolab LIMS',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
