import Navbar from './components/Navbar'
import './globals.css'

export const metadata = {
  title: 'Paymi - Split Receipts Effortlessly',
  description: 'AI-powered receipt splitting application with Solana Pay integration',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="app">
          <Navbar />
          {children}
        </div>
      </body>
    </html>
  )
}

