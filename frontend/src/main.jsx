import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
// Bug 6：KaTeX CSS 必須在頂層 import 一次，否則 rehype-katex 渲染出來的數學式沒有 style
import 'katex/dist/katex.min.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
