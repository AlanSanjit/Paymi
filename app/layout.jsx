import Navbar from './components/Navbar'
import AuthGuard from './components/AuthGuard'
import LayoutWrapper from './components/LayoutWrapper'
import './globals.css'

export const metadata = {
  title: 'Paymi - Split Receipts Effortlessly',
  description: 'AI-powered receipt splitting application with Solana Pay integration',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthGuard>
          <LayoutWrapper>
            {children}
          </LayoutWrapper>
        </AuthGuard>
      </body>
    </html>
  )
}

