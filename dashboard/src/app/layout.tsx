import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'PROPMETRIK | Real Estate Intelligence',
  description: 'Ghana\'s definitive real estate intelligence and operations platform.',
};

import TopNav from '@/components/TopNav';
import Footer from '@/components/Footer';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased bg-background text-foreground flex flex-col min-h-screen`}>
        <TopNav />
        {children}
        <Footer />
      </body>
    </html>
  );
}
