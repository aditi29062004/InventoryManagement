
import { useEffect, useState } from 'react'
import { apiRequest } from '../../api/client'

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

function formatCurrency(value) {
  return currencyFormatter.format(Number(value) || 0)
}

function MetricCard({ label, value, note }) {
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
      </div>
      <div className="metric-value">{value}</div>
      <p className="metric-note">{note}</p>
    </article>
  )
}

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function loadAnalytics() {
      setLoading(true)
      setError('')

      try {
        const response = await apiRequest('/analytics/summary')

        if (!response?.success || !response.data) {
          throw new Error('Invalid analytics response')
        }

        if (!cancelled) {
          setAnalytics(response.data)
        }
      } catch {
        if (!cancelled) {
          setError(
            'Unable to load analytics. Check your connection and try again.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadAnalytics()

    return () => {
      cancelled = true
    }
  }, [retryCount])

  const inventory = analytics?.inventory
  const sales = analytics?.sales
  const products = analytics?.productPerformance ?? []
  const categories = analytics?.categoryBreakdown ?? []

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">INSIGHTS & REPORTING</p>
          <h1>Analytics</h1>
          <p className="page-description">
            Understand your inventory, sales performance, and product trends.
          </p>
        </div>
      </div>

      {error && (
        <section className="dashboard-error" role="alert">
          <div>
            <strong>Analytics unavailable</strong>
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

      <section className="analytics-section">
        <div className="section-heading">
          <h2>Inventory overview</h2>
          <p>Current active inventory</p>
        </div>

        <div className="metrics-grid">
          <MetricCard
            label="Active Products"
            value={loading ? '…' : inventory?.activeProducts ?? '—'}
            note="Active products in your inventory"
          />
          <MetricCard
            label="Units in Stock"
            value={loading ? '…' : inventory?.totalUnits ?? '—'}
            note="Units across active products"
          />
          <MetricCard
            label="Low Stock Products"
            value={loading ? '…' : inventory?.lowStockProducts ?? '—'}
            note="At or below reorder level"
          />
          <MetricCard
            label="Inventory Cost Value"
            value={
              loading
                ? '…'
                : inventory
                  ? formatCurrency(inventory.inventoryCostValue)
                  : '—'
            }
            note="Current stock × cost price"
          />
        </div>
      </section>

      <section className="analytics-section">
        <div className="section-heading">
          <h2>Sales overview</h2>
          <p>Order totals and completed sales</p>
        </div>

        <div className="metrics-grid">
          <MetricCard
            label="Completed Revenue"
            value={
              loading
                ? '…'
                : sales
                  ? formatCurrency(sales.completedRevenue)
                  : '—'
            }
            note="Revenue from completed orders"
          />
          <MetricCard
            label="Completed Orders"
            value={loading ? '…' : sales?.completedOrders ?? '—'}
            note="Successfully completed orders"
          />
          <MetricCard
            label="Average Order Value"
            value={
              loading
                ? '…'
                : sales
                  ? formatCurrency(sales.averageOrderValue)
                  : '—'
            }
            note="Completed revenue ÷ completed orders"
          />
          <MetricCard
            label="Active Suppliers"
            value={loading ? '…' : analytics?.supplierCount ?? '—'}
            note="Active suppliers in your account"
          />
        </div>

        {!loading && !error && sales && (
          <div className="order-status-summary">
            <span>Total orders: <strong>{sales.totalOrders}</strong></span>
            <span>Pending: <strong>{sales.pendingOrders}</strong></span>
            <span>Cancelled: <strong>{sales.cancelledOrders}</strong></span>
          </div>
        )}
      </section>

      <section className="analytics-section analytics-panels">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>Top-performing products</h2>
              <p>Ranked by completed-order revenue</p>
            </div>
          </div>

          {loading ? (
            <div className="empty-state" role="status">
              <strong>Loading product performance…</strong>
            </div>
          ) : error ? (
            <div className="empty-state">
              <strong>Product performance unavailable</strong>
            </div>
          ) : products.length === 0 ? (
            <div className="empty-state">
              <strong>No completed sales yet</strong>
              <p>Product performance will appear after orders are completed.</p>
            </div>
          ) : (
            <div className="analytics-table-wrap">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Units sold</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.productId}>
                      <td>{product.productName}</td>
                      <td>{product.sku}</td>
                      <td>{product.unitsSold}</td>
                      <td>{formatCurrency(product.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>Inventory by category</h2>
              <p>Current stock value by product category</p>
            </div>
          </div>

          {loading ? (
            <div className="empty-state" role="status">
              <strong>Loading category breakdown…</strong>
            </div>
          ) : error ? (
            <div className="empty-state">
              <strong>Category breakdown unavailable</strong>
            </div>
          ) : categories.length === 0 ? (
            <div className="empty-state">
              <strong>No inventory categories yet</strong>
              <p>Active product categories will appear here.</p>
            </div>
          ) : (
            <div className="category-list">
              {categories.map((category) => (
                <div className="category-row" key={category.category}>
                  <div className="category-row-heading">
                    <strong>{category.category}</strong>
                    <span>{formatCurrency(category.inventoryCostValue)}</span>
                  </div>
                  <div className="category-row-meta">
                    <span>{category.productCount} products</span>
                    <span>{category.totalUnits} units</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>
    </>
  )
}