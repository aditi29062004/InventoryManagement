
import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { apiRequest } from '../../api/client'

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

function formatCurrency(value) {
  return currencyFormatter.format(Number(value) || 0)
}

function formatDate(value) {
  if (!value) return '—'

  const date = new Date(value)

  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
}

export default function DashboardPage() {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function loadDashboard() {
      setLoading(true)
      setError('')

      try {
        const response = await apiRequest('/dashboard/summary')

        if (!response?.success || !response.data) {
          throw new Error('Invalid dashboard response')
        }

        if (!cancelled) {
          setSummary(response.data)
        }
      } catch {
        if (!cancelled) {
          setError(
            'We could not load your dashboard. Check your connection and try again.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadDashboard()

    return () => {
      cancelled = true
    }
  }, [retryCount])

  const products = summary?.products
  const orders = summary?.orders
  const recentOrders = summary?.recentOrders ?? []

  const metrics = [
    {
      label: 'Total Products',
      value: products?.activeCount ?? '—',
      note: 'Active products',
      icon: 'P',
      tone: 'blue',
    },
    {
      label: 'Units in Stock',
      value: products?.totalUnits ?? '—',
      note: 'Units across active products',
      icon: 'U',
      tone: 'green',
    },
    {
      label: 'Low Stock Items',
      value: products?.lowStockCount ?? '—',
      note: 'At or below reorder level',
      icon: '!',
      tone: 'orange',
    },
    {
      label: 'Inventory Value',
      value: products
        ? formatCurrency(products.inventoryCostValue)
        : '—',
      note: 'Estimated cost value',
      icon: '₹',
      tone: 'purple',
    },
  ]

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">OVERVIEW</p>
          <h1>Inventory Dashboard</h1>
          <p className="page-description">
            Here is what is happening with your inventory today.
          </p>
        </div>

        <NavLink to="/products" className="primary-button">
          + Manage Products
        </NavLink>
      </div>

      {error && (
        <section className="dashboard-error" role="alert">
          <div>
            <strong>Dashboard unavailable</strong>
            <p>{error}</p>
          </div>

          <button
            className="secondary-button"
            type="button"
            onClick={() => setRetryCount((count) => count + 1)}
            disabled={loading}
          >
            {loading ? 'Retrying…' : 'Try again'}
          </button>
        </section>
      )}

      <section className="metrics-grid" aria-label="Inventory summary">
        {metrics.map((metric) => (
          <article className="metric-card" key={metric.label}>
            <div className="metric-top">
              <span>{metric.label}</span>
              <span
                className={`metric-icon ${metric.tone}`}
                aria-hidden="true"
              >
                {metric.icon}
              </span>
            </div>

            <div
              className="metric-value"
              aria-live="polite"
            >
              {loading ? '…' : metric.value}
            </div>

            <p className="metric-note">
              {loading ? 'Loading data…' : metric.note}
            </p>
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

            <NavLink to="/orders" className="text-link">
              View all →
            </NavLink>
          </div>

          {loading ? (
            <div className="empty-state" role="status">
              <strong>Loading recent orders…</strong>
              <p>Please wait while we retrieve your sales activity.</p>
            </div>
          ) : error ? (
            <div className="empty-state">
              <strong>Orders unavailable</strong>
              <p>Retry the dashboard request to load your orders.</p>
            </div>
          ) : recentOrders.length === 0 ? (
            <div className="empty-state">
              <strong>No sales orders yet</strong>
              <p>Your recent sales orders will appear here.</p>
            </div>
          ) : (
            <div className="recent-order-list">
              {recentOrders.map((order) => (
                <article
                  className="recent-order-row"
                  key={order._id || order.orderNumber}
                >
                  <div className="recent-order-info">
                    <strong>
                      {order.orderNumber || 'Sales order'}
                    </strong>
                    <span>
                      {order.customerName || 'Customer not specified'}
                    </span>
                    <span>{formatDate(order.createdAt)}</span>
                  </div>

                  <div className="recent-order-total">
                    <strong>{formatCurrency(order.total)}</strong>
                    <span className="status-pill">
                      {order.status || 'Unknown'}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </article>

        <article className="panel stock-panel">
          <div className="panel-heading">
            <div>
              <h2>Low Stock Alerts</h2>
              <p>Products needing attention</p>
            </div>

            <span className="status-pill">
              {loading ? 'Loading…' : error ? 'Unavailable' : 'Live data'}
            </span>
          </div>

          {loading ? (
            <div className="empty-state" role="status">
              <strong>Checking inventory levels…</strong>
            </div>
          ) : error ? (
            <div className="empty-state">
              <strong>Stock alerts unavailable</strong>
              <p>Retry the dashboard request to check inventory levels.</p>
            </div>
          ) : products.lowStockCount === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">✓</div>
              <strong>All clear</strong>
              <p>No active products are currently at or below their reorder levels.</p>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon warning-icon">!</div>
              <strong>
                {products.lowStockCount} product
                {products.lowStockCount === 1 ? '' : 's'} need attention
              </strong>
              <p>
                These active products are at or below their configured reorder
                levels. Review your inventory before placing new orders.
              </p>
              <NavLink to="/products" className="text-link">
                Review products →
              </NavLink>
            </div>
          )}
        </article>
      </section>

      <footer className="dashboard-footer">
        <span>Inventra Inventory Management</span>
        <span>
          {loading
            ? 'Loading dashboard data…'
            : error
              ? 'Dashboard data unavailable'
              : `Sales orders: ${orders?.totalCount ?? 0}`}
        </span>
      </footer>
    </>
  )
}