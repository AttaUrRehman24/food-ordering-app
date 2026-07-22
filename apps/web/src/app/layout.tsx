import type { ReactNode } from 'react';
import { AppHeader } from '@/components/AppHeader';
import { Providers } from '@/components/RequireAuth';
import './globals.css';

export const metadata = {
  title: 'Food Order App',
  description: 'Order fresh meals from your favorite kitchen',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,600;0,9..40,700;1,9..40,400&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="site-shell">
        <Providers>
          <AppHeader />
          <main className="site-main">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
