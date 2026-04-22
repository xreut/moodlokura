import type {Metadata} from 'next';
import { Epilogue, Manrope } from 'next/font/google';
import './globals.css';

const epilogue = Epilogue({
  subsets: ['latin'],
  variable: '--font-epilogue',
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'MoodLOKURA - Tu Diario Emocional',
  description: 'Un diario de estado de ánimo diario, elegante y moderno.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="es" className={`${epilogue.variable} ${manrope.variable} dark`}>
      <body className="bg-background text-on-surface font-body antialiased selection:bg-primary/30 min-h-screen" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
