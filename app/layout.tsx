import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'http://localhost:3000'),
  title: 'Hub de Propostas | Grupo Mercocamp',
  description: 'Portal interno para criar, validar, versionar e emitir propostas comerciais do Grupo Mercocamp.',
  openGraph: {
    title: 'Hub de Propostas Mercocamp',
    description: 'Propostas comerciais claras, versionadas e auditáveis.',
    type: 'website',
    images: [{ url: '/og.png', width: 1536, height: 804, alt: 'Hub de Propostas Mercocamp' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Hub de Propostas Mercocamp',
    description: 'Propostas comerciais claras, versionadas e auditáveis.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
