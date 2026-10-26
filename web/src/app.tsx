import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { DeskPage } from './pages/desk-page'
import { StorefrontPage } from './pages/storefront-page'

/** Routes the shopper help center and the agent desk. */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<StorefrontPage />} />
        <Route path="/desk" element={<DeskPage />} />
      </Routes>
    </BrowserRouter>
  )
}
