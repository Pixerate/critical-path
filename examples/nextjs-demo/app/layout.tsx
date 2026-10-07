import type { ReactNode } from 'react';

export const metadata = {
  title: 'Critical Path - Next.js Demo',
  description: 'A Kanban board built with @critical-path/react and @critical-path/server'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
