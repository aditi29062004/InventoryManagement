
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './features/auth/AuthContext'
import LoginPage from './features/auth/LoginPage'
import RegisterPage from './features/auth/RegisterPage'
import ProtectedRoute from './routes/ProtectedRoute'
import ProductsPage from './features/products/ProductsPage'
import SupplierPage from './features/suppliers/SupplierPage'
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

function Dashboard() {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">OVERVIEW</p>
          <h1>Inventory Dashboard</h1>
          <p className="page-description">
            Here's what's happening with your inventory today.
          </p>
        </div>
        <button className="primary-button" type="button" disabled title="Available after API integration">
          + Add Product
        </button>
      </div>

      <section className="metrics-grid" aria-label="Inventory summary">
        {metrics.map((metric) => (
          <article className="metric-card" key={metric.label}>
            <div className="metric-top">
              <span>{metric.label}</span>
              <span className={`metric-icon ${metric.tone}`} aria-hidden="true">{metric.icon}</span>
            </div>
            <div className="metric-value">{metric.value}</div>
            <p className="metric-note">{metric.note}</p>
          </article>
        ))}
      </section>

      <section className="dashboard-grid">
        <article className="panel orders-panel">
          <div className="panel-heading">
            <div>
              <h2>Recent Orders</h2>
              <p>Your latest sales activity</p>
            </div>
            <NavLink to="/orders" className="text-link">View all →</NavLink>
          </div>

          <div className="empty-state">
            <div className="empty-icon">▤</div>
            <strong>No order data connected yet</strong>
            <p>Orders will appear here once we connect the backend API.</p>
          </div>
        </article>

        <article className="panel stock-panel">
          <div className="panel-heading">
            <div>
              <h2>Low Stock Alerts</h2>
              <p>Products needing attention</p>
            </div>
            <span className="status-pill">Live data pending</span>
          </div>

          <div className="empty-state">
            <div className="empty-icon warning-icon">!</div>
            <strong>No stock data connected yet</strong>
            <p>We'll display low-stock products from your inventory.</p>
          </div>
        </article>
      </section>

      <footer className="dashboard-footer">
        <span>Inventra Inventory Management</span>
        <span>Dashboard UI preview · API not connected</span>
      </footer>
    </>
  )
}

function PlaceholderPage({ title }) {
  return (
    <section className="panel placeholder-page">
      <p className="eyebrow">WORKSPACE</p>
      <h1>{title}</h1>
      <p>This page will be implemented and connected to the backend in a later step.</p>
      <NavLink to="/dashboard" className="text-link">← Back to Dashboard</NavLink>
    </section>
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
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/suppliers" element={<SupplierPage />} />
          <Route path="/orders" element={<PlaceholderPage title="Sales Orders" />} />
          <Route path="/purchase-orders" element={<PlaceholderPage title="Purchase Orders" />} />
          <Route path="/analytics" element={<PlaceholderPage title="Analytics" />} />
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