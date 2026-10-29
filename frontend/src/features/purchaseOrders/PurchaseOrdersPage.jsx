
import { useEffect, useState } from 'react'
import { apiRequest } from '../../api/client'

const PAGE_SIZE = 20

const STATUS_OPTIONS = [
  { label: 'All statuses', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Ordered', value: 'ordered' },
  { label: 'Partially received', value: 'partially_received' },
  { label: 'Received', value: 'received' },
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

export default function PurchaseOrdersPage() {
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [suppliers, setSuppliers] = useState([])
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
  const [referencesLoading, setReferencesLoading] = useState(true)
  const [error, setError] = useState('')
  const [referencesError, setReferencesError] = useState('')
  const [retryKey, setRetryKey] = useState(0)

  const [supplierId, setSupplierId] = useState('')
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unitCost, setUnitCost] = useState('')
  const [orderItems, setOrderItems] = useState([])

  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createSuccess, setCreateSuccess] = useState('')

  const [receivingOrderId, setReceivingOrderId] = useState('')
  const [receivingItems, setReceivingItems] = useState({})
  const [receiving, setReceiving] = useState(false)
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadReferences() {
      setReferencesLoading(true)
      setReferencesError('')

      try {
        const [supplierResponse, productResponse] = await Promise.all([
          apiRequest('/suppliers?limit=100&status=active'),
          apiRequest('/products?limit=100&status=active'),
        ])

        if (cancelled) return

        setSuppliers(
          Array.isArray(supplierResponse.data) ? supplierResponse.data : [],
        )
        setProducts(
          Array.isArray(productResponse.data) ? productResponse.data : [],
        )
      } catch (requestError) {
        if (!cancelled) {
          setReferencesError(getErrorMessage(requestError))
        }
      } finally {
        if (!cancelled) setReferencesLoading(false)
      }
    }

    loadReferences()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadPurchaseOrders() {
      setLoading(true)
      setError('')

      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(PAGE_SIZE),
        })

        if (status) params.set('status', status)

        const response = await apiRequest(
          `/purchase-orders?${params.toString()}`,
        )

        if (cancelled) return

        setPurchaseOrders(
          Array.isArray(response.data) ? response.data : [],
        )
        setPagination(
          response.pagination ?? {
            page,
            limit: PAGE_SIZE,
            total: Array.isArray(response.data)
              ? response.data.length
              : 0,
            totalPages: 0,
          },
        )
      } catch (requestError) {
        if (!cancelled) {
          setPurchaseOrders([])
          setError(getErrorMessage(requestError))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadPurchaseOrders()

    return () => {
      cancelled = true
    }
  }, [page, status, retryKey])

  function refreshOrders() {
    setRetryKey((current) => current + 1)
  }

  function handleStatusChange(event) {
    setStatus(event.target.value)
    setPage(1)
  }

  function handleProductChange(event) {
    const nextProductId = event.target.value
    setSelectedProductId(nextProductId)

    const product = products.find(
      (item) => item._id === nextProductId,
    )

    setUnitCost(
      product && product.costPrice != null
        ? String(product.costPrice)
        : '',
    )
  }

  function addProduct() {
    setCreateError('')
    setCreateSuccess('')

    if (!selectedProductId) {
      setCreateError('Please select a product.')
      return
    }

    const parsedQuantity = Number(quantity)
    const parsedUnitCost = Number(unitCost)

    if (!Number.isSafeInteger(parsedQuantity) || parsedQuantity < 1) {
      setCreateError('Quantity must be a positive whole number.')
      return
    }

    if (
      unitCost.trim() === '' ||
      !Number.isFinite(parsedUnitCost) ||
      parsedUnitCost < 0
    ) {
      setCreateError('Enter a valid non-negative unit cost.')
      return
    }

    const product = products.find(
      (item) => item._id === selectedProductId,
    )

    if (!product) {
      setCreateError('Selected product not found. Reload products and try again.')
      return
    }

    setOrderItems((currentItems) => {
      const existing = currentItems.find(
        (item) => item.productId === selectedProductId,
      )

      if (existing) {
        return currentItems.map((item) =>
          item.productId === selectedProductId
            ? {
                ...item,
                quantityOrdered: item.quantityOrdered + parsedQuantity,
                unitCost: parsedUnitCost,
              }
            : item,
        )
      }

      return [
        ...currentItems,
        {
          productId: product._id,
          name: product.name,
          sku: product.sku,
          quantityOrdered: parsedQuantity,
          unitCost: parsedUnitCost,
        },
      ]
    })

    setSelectedProductId('')
    setQuantity('1')
    setUnitCost('')
  }

  function removeProduct(productId) {
    setOrderItems((currentItems) =>
      currentItems.filter((item) => item.productId !== productId),
    )
  }

  const estimatedSubtotal = orderItems.reduce(
    (sum, item) => sum + item.quantityOrdered * item.unitCost,
    0,
  )

  async function handleCreatePurchaseOrder(event) {
    event.preventDefault()
    setCreateError('')
    setCreateSuccess('')

    if (!supplierId) {
      setCreateError('Please select a supplier.')
      return
    }

    if (orderItems.length === 0) {
      setCreateError('Add at least one product to the purchase order.')
      return
    }

    setCreating(true)

    try {
      const body = {
        supplierId,
        items: orderItems.map(
          ({ productId, quantityOrdered, unitCost }) => ({
            productId,
            quantityOrdered,
            unitCost,
          }),
        ),
      }

      if (purchaseOrderNumber.trim()) {
        body.purchaseOrderNumber = purchaseOrderNumber.trim()
      }

      await apiRequest('/purchase-orders', {
        method: 'POST',
        body,
      })

      setCreateSuccess('Purchase order created successfully.')
      setSupplierId('')
      setPurchaseOrderNumber('')
      setOrderItems([])
      setSelectedProductId('')
      setQuantity('1')
      setUnitCost('')
      setPage(1)
      setStatus('')
      refreshOrders()
    } catch (requestError) {
      setCreateError(getErrorMessage(requestError))
    } finally {
      setCreating(false)
    }
  }

  function openReceivingForm(order) {
    setReceivingOrderId(order._id)
    setReceivingItems(
      Object.fromEntries(
        (order.items || [])
          .filter(
            (item) =>
              Number(item.quantityOrdered) >
              Number(item.quantityReceived || 0),
          )
          .map((item) => [
            item.productId?._id || item.productId,
            '',
          ]),
      ),
    )
    setActionError('')
    setActionSuccess('')
  }

  async function handleReceivePurchaseOrder(event, order) {
    event.preventDefault()
    setActionError('')
    setActionSuccess('')

    const items = (order.items || [])
      .map((item) => {
        const productId = item.productId?._id || item.productId
        const remaining =
          Number(item.quantityOrdered) -
          Number(item.quantityReceived || 0)
        const rawQuantity = receivingItems[productId]

        if (rawQuantity === undefined || rawQuantity.trim() === '') {
          return null
        }

        return {
          productId,
          quantity: Number(rawQuantity),
          remaining,
        }
      })
      .filter(Boolean)

    if (items.length === 0) {
      setActionError('Enter a quantity for at least one product.')
      return
    }

    const invalidItem = items.find(
      (item) =>
        !Number.isSafeInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > item.remaining,
    )

    if (invalidItem) {
      setActionError(
        'Each received quantity must be a positive whole number no greater than the remaining quantity.',
      )
      return
    }

    setReceiving(true)

    try {
      const idempotencyKey = createIdempotencyKey()

      await apiRequest(`/purchase-orders/${order._id}/receive`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: {
          items: items.map(({ productId, quantity }) => ({
            productId,
            quantity,
          })),
        },
      })

      setActionSuccess('Stock receipt recorded successfully.')
      setReceivingOrderId('')
      setReceivingItems({})
      refreshOrders()

      const productResponse = await apiRequest(
        '/products?limit=100&status=active',
      )
      setProducts(
        Array.isArray(productResponse.data) ? productResponse.data : [],
      )
    } catch (requestError) {
      setActionError(getErrorMessage(requestError))
    } finally {
      setReceiving(false)
    }
  }

  function getSupplierName(order) {
    const supplierId = order.supplierId?._id || order.supplierId
    return (
      suppliers.find((supplier) => supplier._id === supplierId)?.name ||
      order.supplierName ||
      'Supplier'
    )
  }

  function getProductName(item) {
    const productId = item.productId?._id || item.productId
    return (
      products.find((product) => product._id === productId)?.name ||
      item.productName ||
      'Product'
    )
  }

  const totalPages = pagination.totalPages || 0

  return (
    <section className="panel sales-orders-page purchase-orders-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">INVENTORY MANAGEMENT</p>
          <h1>Purchase Orders</h1>
          <p className="sales-orders-description">
            Order stock from suppliers, track deliveries, and update inventory
            when goods arrive.
          </p>
        </div>

        <div className="sales-orders-total">
          <span>Total purchase orders</span>
          <strong>{pagination.total}</strong>
        </div>
      </div>

      <section className="sales-order-create">
        <h2>Create Purchase Order</h2>
        <p className="sales-orders-description">
          Choose a supplier and add products with their purchase quantities
          and unit costs.
        </p>

        {referencesError && (
          <div className="sales-orders-error" role="alert">
            <p>{referencesError}</p>
            <button
              type="button"
              onClick={() => {
                setReferencesError('')
                setReferencesLoading(true)
                Promise.all([
                  apiRequest('/suppliers?limit=100&status=active'),
                  apiRequest('/products?limit=100&status=active'),
                ])
                  .then(([supplierResponse, productResponse]) => {
                    setSuppliers(supplierResponse.data ?? [])
                    setProducts(productResponse.data ?? [])
                  })
                  .catch((err) => setReferencesError(getErrorMessage(err)))
                  .finally(() => setReferencesLoading(false))
              }}
            >
              Retry loading suppliers and products
            </button>
          </div>
        )}

        <form onSubmit={handleCreatePurchaseOrder}>
          <div className="sales-order-form-grid">
            <label>
              Supplier *
              <select
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
                required
                disabled={creating || referencesLoading}
              >
                <option value="">
                  {referencesLoading ? 'Loading suppliers...' : 'Select a supplier'}
                </option>
                {suppliers.map((supplier) => (
                  <option key={supplier._id} value={supplier._id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Purchase order number (optional)
              <input
                value={purchaseOrderNumber}
                onChange={(event) => setPurchaseOrderNumber(event.target.value)}
                maxLength={100}
                placeholder="Leave blank to generate automatically"
                disabled={creating}
              />
            </label>
          </div>

          <div className="sales-order-product-row">
            <label>
              Product
              <select
                value={selectedProductId}
                onChange={handleProductChange}
                disabled={creating || referencesLoading || products.length === 0}
              >
                <option value="">Select a product</option>
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

            <label>
              Unit cost (₹)
              <input
                type="number"
                min="0"
                step="0.01"
                value={unitCost}
                onChange={(event) => setUnitCost(event.target.value)}
                disabled={creating}
              />
            </label>

            <button
              type="button"
              onClick={addProduct}
              disabled={creating || referencesLoading || products.length === 0}
            >
              Add product
            </button>
          </div>

          {!referencesLoading && !referencesError && suppliers.length === 0 && (
            <p className="sales-orders-message">
              No active suppliers found. Add or activate a supplier first.
            </p>
          )}

          {!referencesLoading && !referencesError && products.length === 0 && (
            <p className="sales-orders-message">
              No active products found. Add or activate a product first.
            </p>
          )}

          {orderItems.length > 0 && (
            <div className="sales-order-items-list">
              <h3>Purchase order items</h3>
              <div className="sales-orders-table-wrapper">
                <table className="sales-orders-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Unit cost</th>
                      <th>Quantity</th>
                      <th>Line total</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderItems.map((item) => (
                      <tr key={item.productId}>
                        <td>{item.name} ({item.sku})</td>
                        <td>{formatCurrency(item.unitCost)}</td>
                        <td>{item.quantityOrdered}</td>
                        <td>
                          {formatCurrency(item.quantityOrdered * item.unitCost)}
                        </td>
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
                Estimated subtotal: <strong>{formatCurrency(estimatedSubtotal)}</strong>
              </p>
            </div>
          )}

          {createError && (
            <div className="sales-orders-error" role="alert">{createError}</div>
          )}

          {createSuccess && (
            <p className="sales-order-success" role="status">{createSuccess}</p>
          )}

          <button
            type="submit"
            disabled={
              creating ||
              referencesLoading ||
              !supplierId ||
              orderItems.length === 0
            }
          >
            {creating ? 'Creating purchase order...' : 'Create purchase order'}
          </button>
        </form>
      </section>

      <section className="sales-order-items-list">
        <div className="sales-orders-toolbar">
          <h2>Purchase Order History</h2>
          <label>
            Filter by status
            <select value={status} onChange={handleStatusChange} disabled={loading}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {actionError && <div className="sales-orders-error" role="alert">{actionError}</div>}
        {actionSuccess && <p className="sales-order-success" role="status">{actionSuccess}</p>}
        {error && (
          <div className="sales-orders-error" role="alert">
            <p>{error}</p>
            <button type="button" onClick={refreshOrders}>Retry</button>
          </div>
        )}

        {loading ? (
          <p className="sales-orders-message">Loading purchase orders...</p>
        ) : purchaseOrders.length === 0 ? (
          <p className="sales-orders-message">No purchase orders found for this filter.</p>
        ) : (
          <div className="sales-orders-table-wrapper">
            <table className="sales-orders-table">
              <thead>
                <tr>
                  <th>PO number</th>
                  <th>Supplier</th>
                  <th>Created</th>
                  <th>Status</th>
                  <th>Subtotal</th>
                  <th>Items</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrders.map((order) => (
                  <tr key={order._id}>
                    <td>{order.purchaseOrderNumber || '—'}</td>
                    <td>{getSupplierName(order)}</td>
                    <td>{formatDate(order.createdAt)}</td>
                    <td>
                      <span className="status-pill">{order.status}</span>
                    </td>
                    <td>{formatCurrency(order.subtotal)}</td>
                    <td>{order.items?.length || 0}</td>
                    <td>
                      {['pending', 'ordered', 'partially_received'].includes(order.status) &&
                        (order.items || []).some(
                          (item) =>
                            Number(item.quantityOrdered) >
                            Number(item.quantityReceived || 0),
                        ) && (
                          <button
                            type="button"
                            onClick={() => openReceivingForm(order)}
                            disabled={receiving}
                          >
                            Receive stock
                          </button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {receivingOrderId && (
          <div className="sales-order-create">
            <h3>Record stock receipt</h3>
            {(() => {
              const order = purchaseOrders.find(
                (item) => item._id === receivingOrderId,
              )
              if (!order) return null

              return (
                <form onSubmit={(event) => handleReceivePurchaseOrder(event, order)}>
                  <p>
                    Purchase order: <strong>{order.purchaseOrderNumber}</strong>
                  </p>
                  <div className="sales-orders-table-wrapper">
                    <table className="sales-orders-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Ordered</th>
                          <th>Already received</th>
                          <th>Remaining</th>
                          <th>Receive now</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(order.items || [])
                          .filter((item) => {
                            const remaining =
                              Number(item.quantityOrdered) -
                              Number(item.quantityReceived || 0)
                            return remaining > 0
                          })
                          .map((item) => {
                            const productId =
                              item.productId?._id || item.productId
                            const remaining =
                              Number(item.quantityOrdered) -
                              Number(item.quantityReceived || 0)

                            return (
                              <tr key={productId}>
                                <td>{getProductName(item)}</td>
                                <td>{item.quantityOrdered}</td>
                                <td>{item.quantityReceived || 0}</td>
                                <td>{remaining}</td>
                                <td>
                                  <input
                                    type="number"
                                    min="1"
                                    max={remaining}
                                    step="1"
                                    value={receivingItems[productId] ?? ''}
                                    onChange={(event) =>
                                      setReceivingItems((current) => ({
                                        ...current,
                                        [productId]: event.target.value,
                                      }))
                                    }
                                    disabled={receiving}
                                    aria-label={`Quantity to receive for ${getProductName(item)}`}
                                  />
                                </td>
                              </tr>
                            )
                          })}
                      </tbody>
                    </table>
                  </div>

                  <button type="submit" disabled={receiving}>
                    {receiving ? 'Recording receipt...' : 'Record receipt'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReceivingOrderId('')
                      setReceivingItems({})
                    }}
                    disabled={receiving}
                  >
                    Close
                  </button>
                </form>
              )
            })()}
          </div>
        )}

        {!loading && totalPages > 1 && (
          <div className="sales-orders-pagination">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
            >
              Previous
            </button>
            <span>
              Page {pagination.page} of {pagination.totalPages} · {pagination.total} total
            </span>
            <button
              type="button"
              onClick={() =>
                setPage((current) =>
                  Math.min(totalPages, current + 1),
                )
              }
              disabled={page >= totalPages}
            >
              Next
            </button>
          </div>
        )}
      </section>
    </section>
  )
}
