
import { useEffect, useState } from 'react'
import { apiRequest } from '../../api/client'

export default function SupplierPage() {
  const [suppliers, setSuppliers] = useState([])
  const [search, setSearch] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [editingSupplierId, setEditingSupplierId] = useState(null)
  const [form, setForm] = useState({
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    website: '',
    taxId: '',
    address: '',
    paymentTerms: '',
    rating: '',
    notes: '',
  })
  const [statusFilter, setStatusFilter] = useState('active')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function fetchSuppliers() {
      setLoading(true)
      setError('')

      try {
        const params = new URLSearchParams({
          limit: '100',
          status: statusFilter,
        })

        if (search.trim()) {
          params.set('search', search.trim())
        }

        const response = await apiRequest(
          `/suppliers?${params.toString()}`,
        )

        if (!cancelled) {
          setSuppliers(response.data ?? [])
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load suppliers.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchSuppliers()

    return () => {
      cancelled = true
    }
  }, [search, statusFilter, refreshKey])


  function handleFormChange(event) {
    const { name, value } = event.target

    setForm((current) => ({
      ...current,
      [name]: value,
    }))
  }

  function handleEditSupplier(supplier) {
    setEditingSupplierId(supplier._id)

    setForm({
      name: supplier.name || '',
      contactPerson: supplier.contactPerson || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      website: supplier.website || '',
      taxId: supplier.taxId || '',
      address: supplier.address || '',
      paymentTerms: supplier.paymentTerms || '',
      rating: supplier.rating == null ? '' : String(supplier.rating),
      notes: supplier.notes || '',
    })

    setFormError('')
    setSuccessMessage('')
    setShowCreateForm(true)
  }

  async function handleDeactivateSupplier(supplier) {
    const confirmed = window.confirm(
      `Are you sure you want to deactivate "${supplier.name}"?`,
    )

    if (!confirmed) return

    setError('')
    setSuccessMessage('')

    try {
      await apiRequest(`/suppliers/${supplier._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'inactive' }),
      })

      setSuccessMessage('Supplier deactivated successfully.')
      setRefreshKey((current) => current + 1)
    } catch (err) {
      setError(err.message || 'Failed to deactivate supplier.')
    }
  }

  async function handleReactivateSupplier(supplier) {
  setError('')
  setSuccessMessage('')

  try {
    await apiRequest(`/suppliers/${supplier._id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'active' }),
    })

    setSuccessMessage('Supplier reactivated successfully.')
    setRefreshKey((current) => current + 1)
  } catch (err) {
    setError(err.message || 'Failed to reactivate supplier.')
  }
}
  async function handleCreateSupplier(event) {
    event.preventDefault()
    setFormError('')

    const name = form.name.trim()

    if (!name) {
      setFormError('Supplier name is required.')
      return
    }

    if (form.rating.trim() !== '') {
      const rating = Number(form.rating)

      if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
        setFormError('Rating must be a number between 0 and 5.')
        return
      }
    }

    const payload = {
      name,
      contactPerson: form.contactPerson.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      website: form.website.trim() || null,
      taxId: form.taxId.trim() || null,
      address: form.address.trim() || null,
      paymentTerms: form.paymentTerms.trim() || null,
      rating: form.rating.trim() === '' ? null : Number(form.rating),
      notes: form.notes.trim() || null,
    }

    setSaving(true)

    try {
      if (editingSupplierId) {
        await apiRequest(`/suppliers/${editingSupplierId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
      } else {
        await apiRequest('/suppliers', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
      }

      setShowCreateForm(false)
      setEditingSupplierId(null)
      setForm({
        name: '',
        contactPerson: '',
        email: '',
        phone: '',
        website: '',
        taxId: '',
        address: '',
        paymentTerms: '',
        rating: '',
        notes: '',
      })
      setEditingSupplierId(null)
      setSuccessMessage(
        editingSupplierId
          ? 'Supplier updated successfully.'
          : 'Supplier created successfully.',
      )
      setRefreshKey((current) => current + 1)
    } catch (err) {
      setFormError(err.message || 'Failed to create supplier.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="products-page">
    <div className="page-header">
      <div>
        <h1>Suppliers</h1>
        <p>Manage your suppliers and their contact details.</p>
      </div>

      <button
        type="button"
        className="create-product-button"
        onClick={() => {
          setFormError('')
          setShowCreateForm(true)
        }}
      >
        + Create Supplier
      </button>
    </div>

      {successMessage && (
        <div className="products-success" role="status">
          {successMessage}
        </div>
      )}


{showCreateForm && (
  <form
    className="product-form"
    onSubmit={handleCreateSupplier}
  >
    <div className="product-form-header">
      <div>
        <h2>{editingSupplierId ? 'Edit supplier' : 'Create a supplier'}</h2>
        <p>Enter the supplier's contact and business details.</p>
      </div>

      <button
        type="button"
        className="product-form-close"
        onClick={() => setShowCreateForm(false)}
        aria-label="Close supplier form"
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
        Supplier name *
        <input
          name="name"
          value={form.name}
          onChange={handleFormChange}
          maxLength={150}
          required
        />
      </label>

      <label>
        Contact person
        <input
          name="contactPerson"
          value={form.contactPerson}
          onChange={handleFormChange}
        />
      </label>

      <label>
        Email
        <input
          name="email"
          type="email"
          value={form.email}
          onChange={handleFormChange}
        />
      </label>

      <label>
        Phone
        <input
          name="phone"
          type="tel"
          value={form.phone}
          onChange={handleFormChange}
        />
      </label>

      <label>
        Website
        <input
          name="website"
          type="url"
          value={form.website}
          onChange={handleFormChange}
        />
      </label>

      <label>
        Tax ID
        <input
          name="taxId"
          value={form.taxId}
          onChange={handleFormChange}
        />
      </label>

      <label>
        Payment terms
        <input
          name="paymentTerms"
          value={form.paymentTerms}
          onChange={handleFormChange}
          placeholder="e.g. Net 30"
        />
      </label>

      <label>
        Rating (0–5)
        <input
          name="rating"
          type="number"
          min="0"
          max="5"
          step="0.1"
          value={form.rating}
          onChange={handleFormChange}
        />
      </label>

      <label className="product-form-full">
        Address
        <textarea
          name="address"
          value={form.address}
          onChange={handleFormChange}
          rows={2}
        />
      </label>

      <label className="product-form-full">
        Notes
        <textarea
          name="notes"
          value={form.notes}
          onChange={handleFormChange}
          rows={3}
        />
      </label>
    </div>

    <p className="product-form-note">
      Supplier name is required. All other fields are optional.
    </p>

    <div className="product-form-actions">
      <button
        type="button"
        className="product-cancel-button"
        onClick={() => setShowCreateForm(false)}
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
          ? editingSupplierId
            ? 'Saving...'
            : 'Creating...'
          : editingSupplierId
            ? 'Save Changes'
            : 'Create Supplier'}
      </button>
    </div>
  </form>
)}

      <div className="products-toolbar">
        <input
          type="search"
          placeholder="Search suppliers by name, contact, email or phone..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search suppliers"
        />

        <select
          className="products-status-filter"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          aria-label="Filter suppliers by status"
        >
          <option value="active">Active suppliers</option>
          <option value="inactive">Inactive suppliers</option>
        </select>

        <span>{suppliers.length} suppliers shown</span>
      </div>

      {loading ? (
        <p role="status">Loading suppliers...</p>
      ) : error ? (
        <div className="products-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setRefreshKey((current) => current + 1)}
          >
            Try again
          </button>
        </div>
      ) : suppliers.length === 0 ? (
        <div className="products-empty">
          <h2>No suppliers found</h2>
          <p>
            {search.trim()
              ? 'Try a different search term.'
              : statusFilter === 'inactive'
                ? 'There are no inactive suppliers.'
                : statusFilter === 'blocked'
                  ? 'There are no blocked suppliers.'
                  : 'Add a supplier to get started.'}
          </p>
        </div>
      ) : (
        <div className="products-table-wrapper">
          <table className="products-table">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Contact person</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr key={supplier._id}>
                  <td><strong>{supplier.name}</strong></td>
                  <td>{supplier.contactPerson || '—'}</td>
                  <td>{supplier.email || '—'}</td>
                  <td>{supplier.phone || '—'}</td>
                  <td>{supplier.status || 'active'}</td>
                  <td>
  <div className="product-row-actions">
    {supplier.status === 'active' && (
      <>
        <button
          type="button"
          className="product-edit-button"
          onClick={() => handleEditSupplier(supplier)}
        >
          Edit
        </button>

        <button
          type="button"
          className="product-deactivate-button"
          onClick={() => handleDeactivateSupplier(supplier)}
        >
          Deactivate
        </button>
      </>
    )}

    {supplier.status === 'inactive' && (
      <button
        type="button"
        className="product-reactivate-button"
        onClick={() => handleReactivateSupplier(supplier)}
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
