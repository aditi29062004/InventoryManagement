
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './features/auth/AuthContext'
import LoginPage from './features/auth/LoginPage'
import RegisterPage from './features/auth/RegisterPage'
import ProtectedRoute from './routes/ProtectedRoute'
import ProductsPage from './features/products/ProductsPage'
import SupplierPage from './features/suppliers/SupplierPage'
import SalesOrdersPage from './features/orders/SalesOrdersPage'
import PurchaseOrdersPage from './features/purchaseOrders/PurchaseOrdersPage'
import DashboardPage from './features/dashboard/DashboardPage'
import AnalyticsPage from './features/dashboard/AnalyticsPage'
import './App.css'

const navigation = [
  { label: 'Dashboard', path: '/dashboard', icon: '▦' },
  { label: 'Products', path: '/products', icon: '□' },
  { label: 'Suppliers', path: '/suppliers', icon: '♧' },
  { label: 'Sales Orders', path: '/orders', icon: '↗' },
  { label: 'Purchase Orders', path: '/purchase-orders', icon: '↙' },
  { label: 'Analytics', path: '/analytics', icon: '▥' },
]

const metrics = [
  { label: 'Total Products', value: '—', note: 'Awaiting API integration', icon: '□', tone: 'blue' },
  { label: 'Units in Stock', value: '—', note: 'Awaiting API integration', icon: '▤', tone: 'green' },
  { label: 'Low Stock Items', value: '—', note: 'Awaiting API integration', icon: '⚠', tone: 'orange' },
  { label: 'Inventory Value', value: '—', note: 'Awaiting API integration', icon: '₹', tone: 'purple' },
]

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">I</div>
        <div>
          <strong>Inventra</strong>
          <span>INVENTORY MANAGEMENT</span>
        </div>
      </div>

      <div className="nav-heading">WORKSPACE</div>
      <nav className="navigation" aria-label="Main navigation">
        {navigation.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            <span className="nav-icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="avatar">A</div>
        <div className="account-copy">
          <strong>Workspace</strong>
          <span>Inventory Admin</span>
        </div>
        <span className="account-menu" aria-hidden="true">···</span>
      </div>
    </aside>
  )
}

function Topbar() {
  const { user, logout } = useAuth()
  return (
    <header className="topbar">
      <div className="breadcrumb">
        <span>Workspace</span>
        <span>/</span>
        <strong>Dashboard</strong>
      </div>

      <div className="topbar-actions">
        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <input type="search" placeholder="Search inventory..." aria-label="Search inventory" />
          <kbd>⌘ K</kbd>
        </label>
        <button className="icon-button" type="button" aria-label="Notifications">♧</button>
        <button
          className="top-avatar"
          type="button"
          aria-label="Sign out"
          title={`Sign out ${user?.name || ''}`}
          onClick={logout}
        >
          {user?.name?.charAt(0)?.toUpperCase() || 'A'}
        </button>
      </div>
    </header>
  )
}

function AppLayout() {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-column">
        <Topbar />
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function AuthenticatedApp() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/suppliers" element={<SupplierPage />} />
          <Route path="/orders" element={<SalesOrdersPage />} />
          <Route path="/purchase-orders" element={<PurchaseOrdersPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthenticatedApp />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App