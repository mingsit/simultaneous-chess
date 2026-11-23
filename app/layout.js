import './globals.css';

export const metadata = {
  title: 'Simultaneous Chess',
  description:
    'A chess variant where both players lock in their move at the same time — clashes, dodges and free turns included.',
};

export const viewport = {
  themeColor: '#0b1017',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
