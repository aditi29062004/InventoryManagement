
import { useEffect, useState } from 'react'
import { apiRequest } from '../../api/client'

const PAGE_SIZE = 20

const STATUS_OPTIONS = [
  { label: 'All statuses', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
]

function formatCurrency(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)
}

function formatDate(value) {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function getErrorMessage(error) {
  return error?.message || 'Something went wrong. Please try again.'
}

function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export default function SalesOrdersPage() {
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  })

  const [loading, setLoading] = useState(true)
  const [productsLoading, setProductsLoading] = useState(true)
  const [error, setError] = useState('')
  const [productsError, setProductsError] = useState('')
  const [retryKey, setRetryKey] = useState(0)

  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [orderItems, setOrderItems] = useState([])
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createSuccess, setCreateSuccess] = useState('')
  const [actionLoadingId, setActionLoadingId] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')

  async function loadProducts() {
    setProductsLoading(true)
    setProductsError('')

    try {
      const response = await apiRequest('/products?limit=100&status=active')
      setProducts(Array.isArray(response.data) ? response.data : [])
    } catch (requestError) {
      setProductsError(getErrorMessage(requestError))
    } finally {
      setProductsLoading(false)
    }
  }

  useEffect(() => {
    loadProducts()
  }, [])

  useEffect(() => {
    let ignore = false

    async function loadOrders() {
      setLoading(true)
      setError('')

      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(PAGE_SIZE),
        })

        if (status) params.set('status', status)

        const response = await apiRequest(`/orders?${params.toString()}`)

        if (ignore) return

        setOrders(Array.isArray(response.data) ? response.data : [])
        setPagination(
          response.pagination ?? {
            page,
            limit: PAGE_SIZE,
            total: Array.isArray(response.data) ? response.data.length : 0,
            totalPages: 0,
          },
        )
      } catch (requestError) {
        if (!ignore) {
          setOrders([])
          setError(getErrorMessage(requestError))
        }
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    loadOrders()

    return () => {
      ignore = true
    }
  }, [page, status, retryKey])

  function handleStatusChange(event) {
    setStatus(event.target.value)
    setPage(1)
  }

  function addProduct() {
    setCreateError('')
    setCreateSuccess('')

    if (!selectedProductId) {
      setCreateError('Please select a product.')
      return
    }

    const parsedQuantity = Number(quantity)
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
      setCreateError('Quantity must be a positive whole number.')
      return
    }

    const product = products.find((item) => item._id === selectedProductId)
    if (!product) {
      setCreateError('The selected product could not be found. Refresh products and try again.')
      return
    }

    const existingItem = orderItems.find(
      (item) => item.productId === selectedProductId,
    )
    const alreadyAdded = existingItem?.quantity || 0

    if (alreadyAdded + parsedQuantity > Number(product.stockQuantity)) {
      setCreateError(
        `Only ${Math.max(0, Number(product.stockQuantity) - alreadyAdded)} more unit(s) of ${product.name} can be added based on current stock.`,
      )
      return
    }

    setOrderItems((currentItems) => {
      const existing = currentItems.find(
        (item) => item.productId === selectedProductId,
      )

      if (existing) {
        return currentItems.map((item) =>
          item.productId === selectedProductId
            ? { ...item, quantity: item.quantity + parsedQuantity }
            : item,
        )
      }

      return [
        ...currentItems,
        {
          productId: selectedProductId,
          quantity: parsedQuantity,
          name: product.name,
          price: Number(product.price) || 0,
        },
      ]
    })

    setSelectedProductId('')
    setQuantity('1')
  }

  function removeProduct(productId) {
    setOrderItems((currentItems) =>
      currentItems.filter((item) => item.productId !== productId),
    )
  }

  async function handleCreateOrder(event) {
    event.preventDefault()
    setCreateError('')
    setCreateSuccess('')

    if (!customerName.trim()) {
      setCreateError('Please enter the customer name.')
      return
    }

    if (orderItems.length === 0) {
      setCreateError('Add at least one product to the order.')
      return
    }

    setCreating(true)

    try {
      const idempotencyKey = createIdempotencyKey()

      await apiRequest('/orders', {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: {
          customerName: customerName.trim(),
          customerEmail: customerEmail.trim(),
          items: orderItems.map(({ productId, quantity }) => ({
            productId,
            quantity,
          })),
        },
      })

      setCreateSuccess('Sales order created successfully.')
      setCustomerName('')
      setCustomerEmail('')
      setOrderItems([])
      setSelectedProductId('')
      setQuantity('1')
      setPage(1)
      setStatus('')
      setRetryKey((key) => key + 1)

      await loadProducts()
    } catch (requestError) {
      setCreateError(getErrorMessage(requestError))
    } finally {
      setCreating(false)
    }
  }

  const totalPages = pagination.totalPages || 0
  const estimatedTotal = orderItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  )
  
  async function handleOrderAction(orderId, action) {
  const actionLabel = action === 'complete' ? 'complete' : 'cancel'

  if (
    action === 'cancel' &&
    !window.confirm('Cancel this order? The ordered stock will be restored.')
  ) {
    return
  }

  setActionLoadingId(orderId)
  setActionError('')
  setActionSuccess('')

  try {
    await apiRequest(`/orders/${orderId}/${action}`, {
      method: 'POST',
    })

    setActionSuccess(
      action === 'complete'
        ? 'Order completed successfully.'
        : 'Order cancelled successfully. Stock has been restored.',
    )

    setRetryKey((key) => key + 1)
  } catch (requestError) {
    setActionError(
      requestError.message || `Unable to ${actionLabel} this order.`,
    )
  } finally {
    setActionLoadingId('')
  }
}
  return (
    <section className="panel sales-orders-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">INVENTORY MANAGEMENT</p>
          <h1>Sales Orders</h1>
          <p className="sales-orders-description">
            Create customer orders, track sales, and monitor order status.
          </p>
        </div>

        <div className="sales-orders-total">
          <span>Total orders</span>
          <strong>{pagination.total}</strong>
        </div>
      </div>

      <section className="sales-order-create">
        <h2>Create Sales Order</h2>
        <p className="sales-orders-description">
          Add customer details and select the products to sell.
        </p>

        <form onSubmit={handleCreateOrder}>
          <div className="sales-order-form-grid">
            <label>
              Customer name *
              <input
                type="text"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder="Enter customer name"
                required
                maxLength={150}
                disabled={creating}
              />
            </label>

            <label>
              Customer email
              <input
                type="email"
                value={customerEmail}
                onChange={(event) => setCustomerEmail(event.target.value)}
                placeholder="customer@example.com"
                maxLength={254}
                disabled={creating}
              />
            </label>
          </div>

          <div className="sales-order-product-row">
            <label>
              Product
              <select
                value={selectedProductId}
                onChange={(event) => setSelectedProductId(event.target.value)}
                disabled={creating || productsLoading || products.length === 0}
              >
                <option value="">
                  {productsLoading ? 'Loading products...' : 'Select a product'}
                </option>
                {products.map((product) => (
                  <option key={product._id} value={product._id}>
                    {product.name} ({product.sku}) — Stock: {product.stockQuantity}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Quantity
              <input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                disabled={creating}
              />
            </label>

            <button
              type="button"
              onClick={addProduct}
              disabled={creating || productsLoading || products.length === 0}
            >
              Add product
            </button>
          </div>

          {productsError && (
            <div className="sales-orders-error" role="alert">
              <p>{productsError}</p>
              <button type="button" onClick={loadProducts}>
                Retry loading products
              </button>
            </div>
          )}

          {!productsLoading && !productsError && products.length === 0 && (
            <p className="sales-orders-message">
              No active products found. Add or activate a product before creating an order.
            </p>
          )}

          {orderItems.length > 0 && (
            <div className="sales-order-items-list">
              <h3>Order items</h3>
              <div className="sales-orders-table-wrapper">
                <table className="sales-orders-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Unit price (estimate)</th>
                      <th>Quantity</th>
                      <th>Subtotal (estimate)</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderItems.map((item) => (
                      <tr key={item.productId}>
                        <td>{item.name}</td>
                        <td>{formatCurrency(item.price)}</td>
                        <td>{item.quantity}</td>
                        <td>{formatCurrency(item.price * item.quantity)}</td>
                        <td>
                          <button
                            type="button"
                            onClick={() => removeProduct(item.productId)}
                            disabled={creating}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="sales-order-estimated-total">
                Estimated total: <strong>{formatCurrency(estimatedTotal)}</strong>
              </p>
              <p className="sales-orders-description">
                The backend calculates the final order price. This total is only an estimate.
              </p>
            </div>
          )}

          {createError && (
            <div className="sales-orders-error" role="alert">
              {createError}
            </div>
          )}

          {createSuccess && (
            <p className="sales-order-success" role="status">
              {createSuccess}
            </p>
          )}

          <button type="submit" disabled={creating || productsLoading}>
            {creating ? 'Creating order...' : 'Create order'}
          </button>
        </form>
      </section>

      <div className="sales-orders-toolbar">
        <label htmlFor="order-status-filter">Filter by status</label>
        <select
          id="order-status-filter"
          value={status}
          onChange={handleStatusChange}
          disabled={loading}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value || 'all'} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="sales-orders-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setRetryKey((key) => key + 1)}
          >
            Retry
          </button>
        </div>
      )}

      <div className="sales-orders-table-wrapper">
            {actionError && (
            <div className="sales-orders-error" role="alert">
                {actionError}
            </div>
            )}

            {actionSuccess && (
            <p className="sales-order-success" role="status">
                {actionSuccess}
            </p>
            )}
        <table className="sales-orders-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Total</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="sales-orders-message">
                  Loading sales orders…
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={7} className="sales-orders-message">
                  Orders could not be loaded.
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="sales-orders-message">
                  No sales orders found for this filter.
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order._id}>
                  <td>
                    <strong>{order.orderNumber || '—'}</strong>
                    <span className="sales-order-id">
                      {order._id ? order._id.slice(-8) : ''}
                    </span>
                  </td>
                  <td>
                    <strong>{order.customerName || 'Walk-in customer'}</strong>
                    {order.customerEmail && (
                      <span className="sales-order-email">
                        {order.customerEmail}
                      </span>
                    )}
                  </td>
                  <td>
                    <span>
                      {(order.items || []).reduce(
                        (sum, item) => sum + (Number(item.quantity) || 0),
                        0,
                      )}{' '}
                      unit(s)
                    </span>
                    <span className="sales-order-items">
                      {(order.items || []).length} product type(s)
                    </span>
                  </td>
                  <td>
                    <strong>{formatCurrency(order.total)}</strong>
                  </td>
                  <td>
                    <span
                      className={`sales-order-status status-${order.status || 'unknown'}`}
                    >
                      {(order.status || 'unknown').replaceAll('_', ' ')}
                    </span>
                  </td>
                  <td>{formatDate(order.createdAt)}</td>
                    <td>
                    {order.status === 'pending' ? (
                        <div className="sales-order-actions">
                        <button
                            type="button"
                            onClick={() => handleOrderAction(order._id, 'complete')}
                            disabled={actionLoadingId === order._id}
                        >
                            {actionLoadingId === order._id ? 'Processing...' : 'Complete'}
                        </button>

                        <button
                            type="button"
                            onClick={() => handleOrderAction(order._id, 'cancel')}
                            disabled={actionLoadingId === order._id}
                        >
                            Cancel
                        </button>
                        </div>
                    ) : (
                        <span>—</span>
                    )}
                    </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="sales-orders-pagination">
        <span>
          {pagination.total === 0
            ? 'No orders'
            : `Page ${page} of ${Math.max(totalPages, 1)} · ${pagination.total} order(s)`}
        </span>

        <div>
          <button
            type="button"
            onClick={() => setPage((currentPage) => currentPage - 1)}
            disabled={loading || page <= 1}
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setPage((currentPage) => currentPage + 1)}
            disabled={loading || totalPages === 0 || page >= totalPages}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  )
}