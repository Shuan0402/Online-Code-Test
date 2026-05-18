import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
      <p className="text-xl text-foreground">找不到頁面</p>
      <Link to="/" className="text-primary underline text-sm">
        回首頁
      </Link>
    </div>
  )
}
