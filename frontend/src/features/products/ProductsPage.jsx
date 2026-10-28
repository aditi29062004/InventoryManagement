
import { useEffect, useState } from 'react'
import { apiRequest } from '../../api/client'

export default function ProductsPage() {

const [products, setProducts] = useState([])
const [search, setSearch] = useState('')
const [statusFilter, setStatusFilter] = useState('active')
const [loading, setLoading] = useState(true)
const [error, setError] = useState('')
const [showCreateForm, setShowCreateForm] = useState(false)
const [editingProduct, setEditingProduct] = useState(null)
const [saving, setSaving] = useState(false)
const [formError, setFormError] = useState('')
const [successMessage, setSuccessMessage] = useState('')
const [refreshKey, setRefreshKey] = useState(0)

const [form, setForm] = useState({
  name: '',
  sku: '',
  barcode: '',
  description: '',
  category: '',
  price: '',
  costPrice: '',
  stockQuantity: '0',
  reorderLevel: '10',
  imageUrl: '',
})


  useEffect(() => {
    let cancelled = false

    async function fetchProducts() {
      setLoading(true)
      setError('')

      try {
        const params = new URLSearchParams({ limit: '100' })
        params.set('status', statusFilter)

        if (search.trim()) {
          params.set('search', search.trim())
        }

        const response = await apiRequest(`/products?${params.toString()}`)

        if (!cancelled) {
          setProducts(response.data ?? [])
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load products.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchProducts()

    return () => {
      cancelled = true
    }
  }, [search, statusFilter, refreshKey])

  function getStockStatus(product) {
    if (product.stockQuantity <= 0) return 'Out of stock'
    if (product.stockQuantity <= product.reorderLevel) return 'Low stock'
    return 'In stock'
  }


function handleEditProduct(product) {
  setEditingProduct(product)
  setFormError('')
  setSuccessMessage('')
  setForm({
    name: product.name ?? '',
    sku: product.sku ?? '',
    barcode: product.barcode ?? '',
    description: product.description ?? '',
    category: product.category ?? '',
    price: String(product.price ?? ''),
    costPrice: String(product.costPrice ?? ''),
    stockQuantity: String(product.stockQuantity ?? 0),
    reorderLevel: String(product.reorderLevel ?? 10),
    imageUrl: product.imageUrl ?? '',
  })
  setShowCreateForm(true)
}


async function handleDeactivateProduct(product) {
  const confirmed = window.confirm(
    `Are you sure you want to deactivate "${product.name}"? It will no longer appear in the active product list.`,
  )

  if (!confirmed) {
    return
  }

  setError('')
  setSuccessMessage('')

  try {
    await apiRequest(`/products/${product._id}`, {
      method: 'DELETE',
    })

    setSuccessMessage('Product deactivated successfully.')
    setRefreshKey((current) => current + 1)
  } catch (err) {
    setError(err.message || 'Failed to deactivate product.')
  }
}


async function handleReactivateProduct(product) {
  const confirmed = window.confirm(
    `Are you sure you want to reactivate "${product.name}"?`,
  )

  if (!confirmed) {
    return
  }

  setError('')
  setSuccessMessage('')

  try {
    await apiRequest(`/products/${product._id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'active' }),
    })

    setSuccessMessage('Product reactivated successfully.')
    setRefreshKey((current) => current + 1)
  } catch (err) {
    setError(err.message || 'Failed to reactivate product.')
  }
}

function handleFormChange(event) {
  const { name, value } = event.target

  setForm((current) => ({
    ...current,
    [name]: value,
  }))
}

async function handleCreateProduct(event) {
  event.preventDefault()
  setFormError('')
  setSuccessMessage('')

  const name = form.name.trim()
  const sku = form.sku.trim()
  const price = Number(form.price)
  const costPrice = Number(form.costPrice)
  const stockQuantity = Number(form.stockQuantity)
  const reorderLevel = Number(form.reorderLevel)

  if (!name || !sku || form.price === '' || form.costPrice === '') {
    setFormError('Name, SKU, selling price, and cost price are required.')
    return
  }

  if (name.length > 150 || sku.length > 64) {
    setFormError('Name must be at most 150 characters and SKU at most 64.')
    return
  }

  if (
    !Number.isFinite(price) ||
    !Number.isFinite(costPrice) ||
    price < 0 ||
    costPrice < 0
  ) {
    setFormError('Prices must be valid non-negative numbers.')
    return
  }

  if (
    !Number.isInteger(stockQuantity) ||
    stockQuantity < 0 ||
    !Number.isInteger(reorderLevel) ||
    reorderLevel < 0
  ) {
    setFormError('Stock quantity and reorder level must be non-negative integers.')
    return
  }

  if (form.barcode.trim().length > 64) {
    setFormError('Barcode cannot exceed 64 characters.')
    return
  }

  if (form.description.length > 2000) {
    setFormError('Description cannot exceed 2000 characters.')
    return
  }

  if (form.category.trim().length > 100) {
    setFormError('Category cannot exceed 100 characters.')
    return
  }

  if (form.imageUrl.trim().length > 2048) {
    setFormError('Image URL cannot exceed 2048 characters.')
    return
  }

  setSaving(true)

  try {

    const payload = {
      name,
      sku,
      price,
      costPrice,
      reorderLevel,
      barcode: form.barcode.trim() || null,
      description: form.description.trim(),
      category: form.category.trim() || 'Uncategorized',
      imageUrl: form.imageUrl.trim(),
    }

    if (editingProduct) {
      await apiRequest(`/products/${editingProduct._id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
    } else {
      payload.stockQuantity = stockQuantity

      await apiRequest('/products', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    }

    setForm({
      name: '',
      sku: '',
      barcode: '',
      description: '',
      category: '',
      price: '',
      costPrice: '',
      stockQuantity: '0',
      reorderLevel: '10',
      imageUrl: '',
    })


    setShowCreateForm(false)
    setEditingProduct(null)
    setSuccessMessage(
      editingProduct
        ? 'Product updated successfully.'
        : 'Product created successfully.',
    )
    setRefreshKey((current) => current + 1)

    } catch (err) {
      setFormError(err.message || 'Failed to create product.')
    } finally {
      setSaving(false)
    }
}

  return (
    <section className="products-page">

<div className="page-header">
  <div>
    <h1>Products</h1>
    <p>Manage and monitor your inventory.</p>
  </div>

  <button
    type="button"
    className="create-product-button"
    onClick={() => {
      setEditingProduct(null)
      setForm({
        name: '',
        sku: '',
        barcode: '',
        description: '',
        category: '',
        price: '',
        costPrice: '',
        stockQuantity: '0',
        reorderLevel: '10',
        imageUrl: '',
      })
      setFormError('')
      setSuccessMessage('')
      setShowCreateForm(true)
    }}
  >
    + Create Product
  </button>
</div>

{successMessage && (
  <div className="products-success" role="status">
    {successMessage}
  </div>
)}

{showCreateForm && (
  <form className="product-form" onSubmit={handleCreateProduct}>
    <div className="product-form-header">
      <div>
        <h2>{editingProduct ? 'Edit product' : 'Create a product'}</h2>
        <p>
            {editingProduct
            ? 'Update the product details below.'
            : 'Enter the product details for your inventory.'}
      </p>
      </div>

      <button
        type="button"
        className="product-form-close"
        onClick={() => {
          setShowCreateForm(false)
          setEditingProduct(null)
          setFormError('')
        }}
        aria-label="Close product form"
      >
        ×
      </button>
    </div>

    {formError && (
      <div className="products-error" role="alert">
        {formError}
      </div>
    )}

    <div className="product-form-grid">
      <label>
        Product name *
        <input
          name="name"
          value={form.name}
          onChange={handleFormChange}
          maxLength={150}
          required
          placeholder="e.g. Wireless Mouse"
        />
      </label>

      <label>
        SKU *
        <input
          name="sku"
          value={form.sku}
          onChange={handleFormChange}
          maxLength={64}
          required
          placeholder="e.g. WM-001"
        />
      </label>

      <label>
        Selling price (₹) *
        <input
          name="price"
          type="number"
          min="0"
          step="any"
          value={form.price}
          onChange={handleFormChange}
          required
          placeholder="0.00"
        />
      </label>

      <label>
        Cost price (₹) *
        <input
          name="costPrice"
          type="number"
          min="0"
          step="any"
          value={form.costPrice}
          onChange={handleFormChange}
          required
          placeholder="0.00"
        />
      </label>

      {!editingProduct && (
          <label>
            Initial stock quantity
            <input
              name="stockQuantity"
              type="number"
              min="0"
              step="1"
              value={form.stockQuantity}
              onChange={handleFormChange}
            />
          </label>
      )}

      <label>
        Reorder level
        <input
          name="reorderLevel"
          type="number"
          min="0"
          step="1"
          value={form.reorderLevel}
          onChange={handleFormChange}
        />
      </label>

      <label>
        Category
        <input
          name="category"
          value={form.category}
          onChange={handleFormChange}
          maxLength={100}
          placeholder="e.g. Electronics"
        />
      </label>

      <label>
        Barcode
        <input
          name="barcode"
          value={form.barcode}
          onChange={handleFormChange}
          maxLength={64}
          placeholder="Optional barcode"
        />
      </label>

      <label className="product-form-full">
        Image URL
        <input
          name="imageUrl"
          type="url"
          value={form.imageUrl}
          onChange={handleFormChange}
          maxLength={2048}
          placeholder="https://example.com/product.jpg"
        />
      </label>

      <label className="product-form-full">
        Description
        <textarea
          name="description"
          value={form.description}
          onChange={handleFormChange}
          maxLength={2000}
          rows={3}
          placeholder="Optional product description"
        />
      </label>
    </div>

    <p className="product-form-note">
      {editingProduct
        ? 'Stock quantity cannot be changed here. Use the stock adjustment workflow to update inventory levels.'
        : 'Fields marked * are required. Initial stock above zero will be recorded as an opening stock movement.'}
    </p>

    <div className="product-form-actions">
      <button
        type="button"
        className="product-cancel-button"
        onClick={() => {
          setShowCreateForm(false)
          setEditingProduct(null)
          setFormError('')
        }}
        disabled={saving}
      >
        Cancel
      </button>

      <button
        type="submit"
        className="create-product-button"
        disabled={saving}
      >
        {saving
          ? editingProduct
          ? 'Saving...'
          : 'Creating...'
          : editingProduct
          ? 'Save Changes'
          : 'Create Product'}
      </button>
    </div>
  </form>
)}

    <div className="products-toolbar">
      <input
        type="search"
        placeholder="Search by name, SKU, barcode or category..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        aria-label="Search products"
      />

      <select
        className="products-status-filter"
        value={statusFilter}
        onChange={(event) => setStatusFilter(event.target.value)}
        aria-label="Filter products by status"
      >
        <option value="active">Active products</option>
        <option value="inactive">Inactive products</option>
      </select>

      <span>{products.length} products shown</span>
    </div>

      {loading ? (
        <p role="status">Loading products...</p>
      ) : error ? (
        <div role="alert" className="products-error">
          <p>{error}</p>
          <button onClick={() => setSearch((value) => value)}>
            Try again
          </button>
        </div>
      ) : products.length === 0 ? (

      <div className="products-empty">
        <h2>
          {search.trim() ? 'No products found' : 'No products to display'}
        </h2>
        <p>
          {search.trim()
            ? 'Try a different search term.'
            : statusFilter === 'inactive'
              ? 'There are no inactive products yet. Deactivated products will appear here.'
              : 'Your active inventory is empty. Add a product to get started.'}
        </p>
      </div>

      ) : (
        <div className="products-table-wrapper">
          <table className="products-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Stock status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product._id}>
                  <td>
                    <strong>{product.name}</strong>
                  </td>
                  <td>{product.sku}</td>
                  <td>{product.category || 'Uncategorized'}</td>
                  <td>
                    {Number(product.price).toLocaleString('en-IN', {
                      style: 'currency',
                      currency: 'INR',
                    })}
                  </td>
                  <td>{product.stockQuantity}</td>
                  <td>
                    <span
                      className={`stock-status stock-status-${getStockStatus(product)
                        .toLowerCase()
                        .replaceAll(' ', '-')}`}
                    >
                      {getStockStatus(product)}
                    </span>
                  </td>

                  <td>
                  <div className="product-actions">
                    {product.status === 'active' ? (
                      <>
                        <button
                          type="button"
                          className="product-edit-button"
                          onClick={() => handleEditProduct(product)}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className="product-deactivate-button"
                          onClick={() => handleDeactivateProduct(product)}
                        >
                          Deactivate
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="product-reactivate-button"
                        onClick={() => handleReactivateProduct(product)}
                      >
                        Reactivate
                      </button>
                    )}
                  </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
