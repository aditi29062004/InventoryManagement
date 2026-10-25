// In-memory database simulation
let database = {
    products: [],
    suppliers: [],
    orders: [],
    purchaseOrders: [],
    orderItems: [],
    purchaseOrderItems: []
};

let nextId = {
    product: 1,
    supplier: 1,
    order: 1,
    purchaseOrder: 1
};

// Initialize with sample data
function initializeData() {
    // Add sample suppliers
    database.suppliers = [
        { id: 1, name: 'TechCorp Supplies', contact_person: 'John Smith', email: 'john@techcorp.com', phone: '555-0101', address: '123 Tech St, Silicon Valley, CA' },
        { id: 2, name: 'Fashion Wholesale Ltd', contact_person: 'Jane Doe', email: 'jane@fashionwholesale.com', phone: '555-0102', address: '456 Fashion Ave, New York, NY' }
    ];
    nextId.supplier = 3;

    // Add sample products
    database.products = [
        { id: 1, name: 'Wireless Headphones', sku: 'WH-001', barcode: '1234567890123', category: 'Electronics', price: 99.99, cost: 60.00, stock: 25, min_stock: 10, supplier_id: 1, description: 'High-quality wireless headphones with noise cancellation' },
        { id: 2, name: 'Cotton T-Shirt', sku: 'CT-001', barcode: '1234567890124', category: 'Clothing', price: 19.99, cost: 8.00, stock: 5, min_stock: 20, supplier_id: 2, description: '100% cotton comfortable t-shirt' },
        { id: 3, name: 'Bluetooth Speaker', sku: 'BS-001', barcode: '1234567890125', category: 'Electronics', price: 79.99, cost: 45.00, stock: 15, min_stock: 8, supplier_id: 1, description: 'Portable Bluetooth speaker with excellent sound quality' }
    ];
    nextId.product = 4;

    // Add sample orders
    database.orders = [
        { id: 1, customer_name: 'Alice Johnson', customer_email: 'alice@example.com', status: 'completed', total: 119.98, created_at: new Date('2025-06-20') },
        { id: 2, customer_name: 'Bob Wilson', customer_email: 'bob@example.com', status: 'pending', total: 79.99, created_at: new Date('2025-06-22') }
    ];
    nextId.order = 3;

    // Add sample order items
    database.orderItems = [
        { id: 1, order_id: 1, product_id: 1, quantity: 1, price: 99.99 },
        { id: 2, order_id: 1, product_id: 2, quantity: 1, price: 19.99 },
        { id: 3, order_id: 2, product_id: 3, quantity: 1, price: 79.99 }
    ];

    updateDashboard();
    updateAllTables();
}

function setupEventListeners() {
    // Form submissions
    const productForm = document.getElementById('product-form');
    const supplierForm = document.getElementById('supplier-form');
    const orderForm = document.getElementById('order-form');
    const purchaseOrderForm = document.getElementById('purchase-order-form');
    
    if (productForm) productForm.addEventListener('submit', addProduct);
    if (supplierForm) supplierForm.addEventListener('submit', addSupplier);
    if (orderForm) orderForm.addEventListener('submit', createOrder);
    if (purchaseOrderForm) purchaseOrderForm.addEventListener('submit', generatePurchaseOrder);

    // Button clicks
    const addOrderItemBtn = document.getElementById('add-order-item-btn');
    const addPOItemBtn = document.getElementById('add-po-item-btn');
    
    if (addOrderItemBtn) addOrderItemBtn.addEventListener('click', addOrderItem);
    if (addPOItemBtn) addPOItemBtn.addEventListener('click', addPOItem);

    // Navigation tabs
    document.querySelectorAll('.nav-tab').forEach(button => {
        button.addEventListener('click', function () {
            const tabId = this.getAttribute('data-tab');
            showTab(tabId);
        });
    });

    // Delegated event listeners for dynamic content
    setupDelegatedEventListeners();
}

function setupDelegatedEventListeners() {
    // Order item management
    const orderItemsContainer = document.getElementById('order-items');
    if (orderItemsContainer) {
        orderItemsContainer.addEventListener('click', function (e) {
            if (e.target.classList.contains('remove-order-item-btn')) {
                const row = e.target.closest('.order-item');
                if (row) row.remove();
            }
        });
    }

    // Purchase order item management
    const poItemsContainer = document.getElementById('po-items');
    if (poItemsContainer) {
        poItemsContainer.addEventListener('click', function (e) {
            if (e.target.classList.contains('remove-po-item-btn')) {
                const row = e.target.closest('.po-item');
                if (row) row.remove();
            }
        });
    }

    // Low stock alerts
    const lowStockAlertsContainer = document.getElementById('low-stock-alerts');
    if (lowStockAlertsContainer) {
        lowStockAlertsContainer.addEventListener('click', function (e) {
            if (e.target.classList.contains('generate-po-btn')) {
                const productId = parseInt(e.target.getAttribute('data-product-id'));
                if (!isNaN(productId)) generatePurchaseOrderFromProduct(productId);
            }
        });
    }

    // Products table
    const productsTable = document.getElementById('products-table');
    if (productsTable) {
        productsTable.addEventListener('click', function (e) {
            if (e.target.classList.contains('delete-product-btn')) {
                const id = parseInt(e.target.getAttribute('data-id'));
                if (!isNaN(id)) deleteProduct(id);
            }
            if (e.target.classList.contains('adjust-stock-btn')) {
                const id = parseInt(e.target.getAttribute('data-id'));
                if (!isNaN(id)) adjustStock(id);
            }
        });
    }

    // Suppliers table
    const suppliersTable = document.getElementById('suppliers-table');
    if (suppliersTable) {
        suppliersTable.addEventListener('click', function (e) {
            if (e.target.classList.contains('delete-supplier-btn')) {
                const id = parseInt(e.target.getAttribute('data-id'));
                if (!isNaN(id)) deleteSupplier(id);
            }
        });
    }

    // Orders table
    const ordersTable = document.getElementById('orders-table');
    if (ordersTable) {
        ordersTable.addEventListener('click', function (e) {
            if (e.target.classList.contains('complete-order-btn')) {
                const id = parseInt(e.target.getAttribute('data-id'));
                if (!isNaN(id)) completeOrder(id);
            }
            if (e.target.classList.contains('cancel-order-btn')) {
                const id = parseInt(e.target.getAttribute('data-id'));
                if (!isNaN(id)) cancelOrder(id);
            }
        });
    }

    // Purchase Orders table
    const purchaseOrdersTable = document.getElementById('purchase-orders-table');
    if (purchaseOrdersTable) {
        purchaseOrdersTable.addEventListener('click', function (e) {
            if (e.target.classList.contains('receive-po-btn')) {
                const id = parseInt(e.target.getAttribute('data-id'));
                if (!isNaN(id)) receivePurchaseOrder(id);
            }
            if (e.target.classList.contains('cancel-po-btn')) {
                const id = parseInt(e.target.getAttribute('data-id'));
                if (!isNaN(id)) cancelPurchaseOrder(id);
            }
        });
    }
}

function generatePurchaseOrderFromProduct(productId) {
    showTab('purchase-orders');
    addPOItem();

    // Set product ID in the last PO row
    const lastRow = document.querySelector('#po-items .po-item:last-child');
    if (lastRow) {
        const productSelect = lastRow.querySelector('[name="product_id"]');
        if (productSelect) {
            productSelect.value = productId;
        }
    }
}

// Tab switching
function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));

    const targetTab = document.getElementById(tabName);
    const targetNavTab = document.querySelector(`.nav-tab[data-tab="${tabName}"]`);
    
    if (targetTab) targetTab.classList.add('active');
    if (targetNavTab) targetNavTab.classList.add('active');

    if (tabName === 'analytics') updateAnalytics();
}

async function addProduct(e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const product = {
    name: formData.get('name'),
    sku: formData.get('sku'),
    barcode: formData.get('barcode'),
    category: formData.get('category'),
    price: parseFloat(formData.get('price')),
    cost: parseFloat(formData.get('cost')),
    stock: parseInt(formData.get('stock')),
    min_stock: parseInt(formData.get('min_stock')),
    supplier_id: formData.get('supplier_id') || null,
    description: formData.get('description')
  };

  try {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product)
    });

    if (!res.ok) throw new Error('Failed to add product');
    showAlert('Product added successfully!');
    updateProductsTable(); // refetch from backend
    e.target.reset();
  } catch (err) {
    console.error(err);
    showAlert('Error adding product', 'danger');
  }
}


function addSupplier(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const supplier = {
        id: nextId.supplier++,
        name: formData.get('name'),
        contact_person: formData.get('contact_person'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        address: formData.get('address')
    };
    const errors = validateSupplier(supplier);
    if (errors.length > 0) return showAlert(errors.join(', '), 'danger');
    database.suppliers.push(supplier);
    showAlert('Supplier added successfully!');
    updateSuppliersTable();
    updateSupplierSelects();
    updateDashboard();
    e.target.reset();
}

function createOrder(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const customerName = formData.get('customer_name');
    const customerEmail = formData.get('customer_email');

    const order = {
        id: nextId.order++,
        customer_name: customerName,
        customer_email: customerEmail,
        status: 'pending',
        created_at: new Date(),
        items: []
    };

    // Get all order item rows
    const itemRows = document.querySelectorAll('#order-items .order-item');
    let totalAmount = 0;
    let hasValidItems = false;

    itemRows.forEach(row => {
        const productId = parseInt(row.querySelector('[name="product_id"]').value);
        const quantity = parseInt(row.querySelector('[name="quantity"]').value);
        const price = parseFloat(row.querySelector('[name="price"]').value);

        if (productId && quantity && price) {
            const product = database.products.find(p => p.id === productId);
            
            if (product.stock < quantity) {
                showAlert(`Insufficient stock for ${product.name}. Available: ${product.stock}`, 'danger');
                return;
            }

            order.items.push({ product_id: productId, quantity, price });
            totalAmount += quantity * price;
            hasValidItems = true;

            // Update stock
            product.stock -= quantity;
        }
    });

    if (!hasValidItems) {
        showAlert('Please add at least one valid item to the order', 'danger');
        return;
    }

    order.total = totalAmount;
    database.orders.push(order);

    // Add order items to database
    order.items.forEach(item => {
        database.orderItems.push({
            id: database.orderItems.length + 1,
            order_id: order.id,
            ...item
        });
    });

    showAlert('Order created successfully!');
    updateOrdersTable();
    updateProductsTable();
    updateDashboard();
    e.target.reset();
    resetOrderItems();
}

function generatePurchaseOrder(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const purchaseOrder = {
        id: nextId.purchaseOrder++,
        supplier_id: parseInt(formData.get('supplier_id')),
        status: 'pending',
        total: 0,
        expected_date: formData.get('expected_date'),
        created_at: new Date()
    };

    const items = [];
    const poItemsDiv = document.getElementById('po-items');
    const poItems = poItemsDiv.querySelectorAll('.po-item');
    
    let totalAmount = 0;
    let hasValidItems = false;

    poItems.forEach(item => {
        const productId = parseInt(item.querySelector('[name="product_id"]').value);
        const quantity = parseInt(item.querySelector('[name="quantity"]').value);
        const unitCost = parseFloat(item.querySelector('[name="unit_cost"]').value);
        
        if (productId && quantity && unitCost) {
            items.push({
                purchase_order_id: purchaseOrder.id,
                product_id: productId,
                quantity: quantity,
                unit_cost: unitCost
            });
            
            totalAmount += quantity * unitCost;
            hasValidItems = true;
        }
    });

    if (!hasValidItems) {
        showAlert('Please add at least one valid item to the purchase order', 'danger');
        return;
    }

    purchaseOrder.total = totalAmount;
    database.purchaseOrders.push(purchaseOrder);
    
    // Add purchase order items to database
    items.forEach(item => {
        database.purchaseOrderItems.push({
            id: database.purchaseOrderItems.length + 1,
            ...item
        });
    });

    showAlert('Purchase order created successfully!');
    updatePurchaseOrdersTable();
    updateDashboard();
    e.target.reset();
    resetPOItems();
}

function resetOrderItems() {
    const orderItemsContainer = document.getElementById('order-items');
    if (orderItemsContainer) {
        orderItemsContainer.innerHTML = `
            <div class="order-item form-grid">
                <div class="form-group">
                    <label>Product</label>
                    <select name="product_id" class="product-select" required>
                        <option value="">Select Product</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Quantity</label>
                    <input type="number" name="quantity" min="1" required>
                </div>
                <div class="form-group">
                    <label>Price</label>
                    <input type="number" name="price" step="0.01" readonly>
                </div>
            </div>
        `;
        updateProductSelects();
    }
}

function resetPOItems() {
    const poItemsContainer = document.getElementById('po-items');
    if (poItemsContainer) {
        poItemsContainer.innerHTML = `
            <div class="po-item form-grid">
                <div class="form-group">
                    <label>Product</label>
                    <select name="product_id" class="po-product-select" required>
                        <option value="">Select Product</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Quantity</label>
                    <input type="number" name="quantity" min="1" required>
                </div>
                <div class="form-group">
                    <label>Unit Cost</label>
                    <input type="number" name="unit_cost" step="0.01" required>
                </div>
            </div>
        `;
        updatePOProductSelects();
    }
}

// Show alert messages
function showAlert(message, type = 'success') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    
    const container = document.querySelector('.container');
    if (container) {
        container.insertBefore(alertDiv, container.firstChild);
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 5000);
    }
}

// Validation functions
function validateProduct(product) {
    const errors = [];
    
    if (!product.name || !product.name.trim()) errors.push('Product name is required');
    if (!product.sku || !product.sku.trim()) errors.push('SKU is required');
    if (product.price <= 0) errors.push('Price must be greater than 0');
    if (product.cost <= 0) errors.push('Cost must be greater than 0');
    if (product.stock < 0) errors.push('Stock cannot be negative');
    if (product.min_stock < 0) errors.push('Minimum stock cannot be negative');
    
    // Check for duplicate SKU
    const existingSKU = database.products.find(p => p.sku === product.sku && p.id !== product.id);
    if (existingSKU) errors.push('SKU already exists');
    
    return errors;
}

function validateSupplier(supplier) {
    const errors = [];
    
    if (!supplier.name || !supplier.name.trim()) errors.push('Company name is required');
    if (!supplier.email || !supplier.email.trim()) errors.push('Email is required');
    if (supplier.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supplier.email)) {
        errors.push('Invalid email format');
    }
    
    return errors;
}

// Add order item
function addOrderItem() {
    const orderItemsDiv = document.getElementById('order-items');
    if (!orderItemsDiv) return;
    
    const newItem = document.createElement('div');
    newItem.className = 'order-item form-grid';
    newItem.innerHTML = `
        <div class="form-group">
            <label>Product</label>
            <select name="product_id" class="product-select" required>
                <option value="">Select Product</option>
            </select>
        </div>
        <div class="form-group">
            <label>Quantity</label>
            <input type="number" name="quantity" min="1" required>
        </div>
        <div class="form-group">
            <label>Price</label>
            <input type="number" name="price" step="0.01" readonly>
        </div>
        <div class="form-group">
            <button type="button" class="btn btn-danger btn-sm remove-order-item-btn">Remove</button>
        </div>
    `;
    orderItemsDiv.appendChild(newItem);
    updateProductSelects();
}

// Add purchase order item
function addPOItem() {
    const poItemsDiv = document.getElementById('po-items');
    if (!poItemsDiv) return;
    
    const newItem = document.createElement('div');
    newItem.className = 'po-item form-grid';
    newItem.innerHTML = `
        <div class="form-group">
            <label>Product</label>
            <select name="product_id" class="po-product-select" required>
                <option value="">Select Product</option>
            </select>
        </div>
        <div class="form-group">
            <label>Quantity</label>
            <input type="number" name="quantity" min="1" required>
        </div>
        <div class="form-group">
            <label>Unit Cost</label>
            <input type="number" name="unit_cost" step="0.01" required>
        </div>
        <div class="form-group">
            <button type="button" class="btn btn-danger btn-sm remove-po-item-btn">Remove</button>
        </div>
    `;
    poItemsDiv.appendChild(newItem);
    updatePOProductSelects();
}

// Update product selects for orders
function updateProductSelects() {
    const selects = document.querySelectorAll('.product-select');
    selects.forEach(select => {
        const currentValue = select.value;
        select.innerHTML = '<option value="">Select Product</option>';
        
        database.products.forEach(product => {
            const option = document.createElement('option');
            option.value = product.id;
            option.textContent = `${product.name} (${product.sku}) - $${product.price} - Stock: ${product.stock}`;
            option.dataset.price = product.price;
            select.appendChild(option);
        });
        
        select.value = currentValue;
        
        // Remove existing event listeners to prevent duplicates
        const newSelect = select.cloneNode(true);
        select.parentNode.replaceChild(newSelect, select);
        
        // Add event listener for price update
        newSelect.addEventListener('change', function() {
            const priceInput = this.closest('.order-item').querySelector('[name="price"]');
            const selectedOption = this.options[this.selectedIndex];
            if (selectedOption.dataset.price) {
                priceInput.value = selectedOption.dataset.price;
            } else {
                priceInput.value = '';
            }
        });
    });
}

// Update product selects for purchase orders
function updatePOProductSelects() {
    const selects = document.querySelectorAll('.po-product-select');
    selects.forEach(select => {
        const currentValue = select.value;
        select.innerHTML = '<option value="">Select Product</option>';
        
        database.products.forEach(product => {
            const option = document.createElement('option');
            option.value = product.id;
            option.textContent = `${product.name} (${product.sku}) - Cost: $${product.cost}`;
            select.appendChild(option);
        });
        
        select.value = currentValue;
    });
}

// Update supplier selects
function updateSupplierSelects() {
    const selects = [
        document.getElementById('product-supplier-select'),
        document.getElementById('po-supplier-select')
    ];
    
    selects.forEach(select => {
        if (select) {
            const currentValue = select.value;
            const firstOption = select.querySelector('option');
            const firstOptionText = firstOption ? firstOption.textContent : 'Select Supplier';
            select.innerHTML = `<option value="">${firstOptionText}</option>`;
            
            database.suppliers.forEach(supplier => {
                const option = document.createElement('option');
                option.value = supplier.id;
                option.textContent = supplier.name;
                select.appendChild(option);
            });
            
            select.value = currentValue;
        }
    });
}

// Update dashboard
function updateDashboard() {
    // Update stats
    const totalProductsEl = document.getElementById('total-products');
    const totalSuppliersEl = document.getElementById('total-suppliers');
    const pendingOrdersEl = document.getElementById('pending-orders');
    const lowStockCountEl = document.getElementById('low-stock-count');
    
    if (totalProductsEl) totalProductsEl.textContent = database.products.length;
    if (totalSuppliersEl) totalSuppliersEl.textContent = database.suppliers.length;
    if (pendingOrdersEl) pendingOrdersEl.textContent = database.orders.filter(o => o.status === 'pending').length;
    
    // Update low stock count and alerts
    const lowStockProducts = database.products.filter(p => p.stock <= p.min_stock);
    if (lowStockCountEl) lowStockCountEl.textContent = lowStockProducts.length;
    
    const alertsDiv = document.getElementById('low-stock-alerts');
    if (alertsDiv) {
        if (lowStockProducts.length === 0) {
            alertsDiv.innerHTML = '<p>No low stock alerts</p>';
        } else {
            alertsDiv.innerHTML = lowStockProducts.map(product => {
                const div = document.createElement('div');
                div.className = 'low-stock-item';
                div.innerHTML = `
                    <strong>${product.name}</strong> (${product.sku})<br>
                    Current Stock: ${product.stock} | Minimum: ${product.min_stock}
                `;
                
                const button = document.createElement('button');
                button.className = 'btn btn-sm btn-primary generate-po-btn';
                button.setAttribute('data-product-id', product.id);
                button.textContent = 'Create PO';
                button.style.marginLeft = '10px';
                
                div.appendChild(button);
                return div.outerHTML;
            }).join('');
        }
    }
    
    // Update recent orders
    const recentOrders = database.orders.slice(-5).reverse();
    const recentOrdersTable = document.getElementById('recent-orders');
    if (recentOrdersTable) {
        recentOrdersTable.innerHTML = recentOrders.map(order => `
            <tr>
                <td>ORD-${String(order.id).padStart(4, '0')}</td>
                <td>${order.customer_name}</td>
                <td>$${order.total.toFixed(2)}</td>
                <td><span class="status-badge status-${order.status}">${order.status.charAt(0).toUpperCase() + order.status.slice(1)}</span></td>
                <td>${order.created_at.toLocaleDateString()}</td>
            </tr>
        `).join('');
    }
}

// Update products table
async function updateProductsTable() {
  const table = document.getElementById('products-table');
  try {
    const res = await fetch('/api/products');
    const products = await res.json();

    table.innerHTML = products.map(product => `
      <tr>
        <td>${product.name}</td>
        <td>${product.sku}</td>
        <td>${product.category || '-'}</td>
        <td>$${(product.price || 0).toFixed(2)}</td>
        <td>${product.stock}</td>
        <td>${product.stock <= product.min_stock ? 'Low' : 'OK'}</td>
        <td>
          <button class="btn btn-danger btn-sm delete-product-btn" data-id="${product.id}">Delete</button>
          <button class="btn btn-secondary btn-sm adjust-stock-btn" data-id="${product.id}">Adjust Stock</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load products:', err);
  }
}


// Update suppliers table
function updateSuppliersTable() {
    const table = document.getElementById('suppliers-table');
    if (!table) return;
    
    table.innerHTML = database.suppliers.map(supplier => {
        const productCount = database.products.filter(p => p.supplier_id === supplier.id).length;
        
        return `
            <tr>
                <td>${supplier.name}</td>
                <td>${supplier.contact_person || 'N/A'}</td>
                <td>${supplier.email}</td>
                <td>${supplier.phone || 'N/A'}</td>
                <td>${productCount}</td>
                <td>
                    <button class="btn btn-danger btn-sm delete-supplier-btn" data-id="${supplier.id}">Delete</button>
                </td>
            </tr>
        `;
    }).join('');
}

// Update orders table
function updateOrdersTable() {
    const table = document.getElementById('orders-table');
    if (!table) return;
    
    table.innerHTML = database.orders.map(order => {
        const itemCount = database.orderItems.filter(item => item.order_id === order.id).length;

        return `
            <tr>
                <td>ORD-${String(order.id).padStart(4, '0')}</td>
                <td>${order.customer_name}</td>
                <td>${itemCount} item(s)</td>
                <td>$${(order.total || 0).toFixed(2)}</td>
                <td><span class="status-badge status-${order.status}">
                  ${order.status.charAt(0).toUpperCase() + order.status.slice(1)}</span></td>
                <td>${order.created_at ? order.created_at.toLocaleDateString() : ''}</td>
                <td>
                    <button class="btn btn-success btn-sm complete-order-btn" data-id="${order.id}" ${order.status === 'completed' ? 'disabled' : ''}>Complete</button>
                    <button class="btn btn-danger btn-sm cancel-order-btn" data-id="${order.id}" ${order.status === 'completed' ? 'disabled' : ''}>Cancel</button>
                </td>
            </tr>
        `;
    }).join('');
}


        // Update purchase orders table
function updatePurchaseOrdersTable() {
    const table = document.getElementById('purchase-orders-table');
    if (!table) return;
    
    table.innerHTML = database.purchaseOrders.map(po => {
        const supplier = database.suppliers.find(s => s.id === po.supplier_id);
        const itemCount = database.purchaseOrderItems.filter(item => item.purchase_order_id === po.id).length;

        return `
            <tr>
                <td>PO-${String(po.id).padStart(4, '0')}</td>
                <td>${supplier ? supplier.name : 'Unknown'}</td>
                <td>${itemCount} item(s)</td>
                <td>$${(po.total || 0).toFixed(2)}</td>
                <td><span class="status-badge status-${po.status}">
                    ${po.status.charAt(0).toUpperCase() + po.status.slice(1)}</span></td>
                <td>${po.created_at?.toLocaleDateString() || ''}</td>
                <td>
                    <button class="btn btn-success btn-sm receive-po-btn" data-id="${po.id}" ${po.status === 'completed' ? 'disabled' : ''}>Receive</button>
                    <button class="btn btn-danger btn-sm cancel-po-btn" data-id="${po.id}" ${po.status === 'completed' ? 'disabled' : ''}>Cancel</button>
                </td>
            </tr>
        `;
    }).join('');
}

// Update all tables
function updateAllTables() {
    updateProductsTable();
    updateSuppliersTable();
    updateOrdersTable();
    updatePurchaseOrdersTable();
    updateSupplierSelects();
    updateProductSelects();
    updatePOProductSelects();
}

// Delete product
function deleteProduct(id) {
    if (confirm('Are you sure you want to delete this product?')) {
        database.products = database.products.filter(p => p.id !== id);
        showAlert('Product deleted successfully!');
        updateAllTables();
        updateDashboard();
    }
}

// Delete supplier
function deleteSupplier(id) {
    const hasProducts = database.products.some(p => p.supplier_id === id);
    if (hasProducts) {
        showAlert('Cannot delete supplier with associated products', 'danger');
        return;
    }
    
    if (confirm('Are you sure you want to delete this supplier?')) {
        database.suppliers = database.suppliers.filter(s => s.id !== id);
        showAlert('Supplier deleted successfully!');
        updateAllTables();
        updateDashboard();
    }
}

// CSP-compliant stock adjustment using a modal dialog
function adjustStock(productId) {
    const product = database.products.find(p => p.id === productId);
    if (!product) return;
    
    // Create a modal dialog for stock adjustment
    const modal = createStockAdjustmentModal(product);
    document.body.appendChild(modal);
    
    // Focus on the input field
    const input = modal.querySelector('#stock-input');
    input.focus();
    input.select();
}

// Create CSP-compliant modal for stock adjustment
function createStockAdjustmentModal(product) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Adjust Stock - ${product.name}</h3>
                <button type="button" class="modal-close" data-action="close-modal">&times;</button>
            </div>
            <div class="modal-body">
                <p>Current stock: <strong>${product.stock}</strong></p>
                <div class="form-group">
                    <label for="stock-input">New stock quantity:</label>
                    <input type="number" id="stock-input" value="${product.stock}" min="0" class="form-control">
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-action="close-modal">Cancel</button>
                <button type="button" class="btn btn-primary" data-action="update-stock" data-product-id="${product.id}">Update Stock</button>
            </div>
        </div>
    `;
    
    // Add event listeners using delegation
    modal.addEventListener('click', handleModalClick);
    modal.addEventListener('keydown', handleModalKeydown);
    
    return modal;
}

// Handle modal interactions
function handleModalClick(e) {
    const action = e.target.getAttribute('data-action');
    const productId = e.target.getAttribute('data-product-id');
    
    if (action === 'close-modal' || e.target.classList.contains('modal-overlay')) {
        closeModal(e.currentTarget);
    } else if (action === 'update-stock' && productId) {
        const input = e.currentTarget.querySelector('#stock-input');
        const newStock = parseInt(input.value);
        
        if (!isNaN(newStock) && newStock >= 0) {
            const product = database.products.find(p => p.id === parseInt(productId));
            if (product) {
                product.stock = newStock;
                showAlert('Stock updated successfully!');
                updateProductsTable();
                updateDashboard();
            }
        } else {
            showAlert('Please enter a valid stock quantity', 'danger');
            return;
        }
        
        closeModal(e.currentTarget);
    }
}

// Handle modal keyboard interactions
function handleModalKeydown(e) {
    if (e.key === 'Escape') {
        closeModal(e.currentTarget);
    } else if (e.key === 'Enter' && e.target.id === 'stock-input') {
        const updateBtn = e.currentTarget.querySelector('[data-action="update-stock"]');
        if (updateBtn) {
            updateBtn.click();
        }
    }
}

// Close modal
function closeModal(modal) {
    if (modal && modal.parentNode) {
        modal.parentNode.removeChild(modal);
    }
}

// Complete order
function completeOrder(orderId) {
    const order = database.orders.find(o => o.id === orderId);
    if (order) {
        order.status = 'completed';
        showAlert('Order completed successfully!');
        updateOrdersTable();
        updateDashboard();
    }
}

// CSP-compliant order cancellation with confirmation
function cancelOrder(orderId) {
    const order = database.orders.find(o => o.id === orderId);
    if (!order) return;
    
    const modal = createConfirmationModal(
        'Cancel Order',
        `Are you sure you want to cancel order ORD-${String(orderId).padStart(4, '0')}?`,
        'cancel-order-confirm',
        orderId
    );
    document.body.appendChild(modal);
}

// Receive purchase order
function receivePurchaseOrder(poId) {
    const po = database.purchaseOrders.find(p => p.id === poId);
    const poItems = database.purchaseOrderItems.filter(item => item.purchase_order_id === poId);
    
    // Update product stock
    poItems.forEach(item => {
        const product = database.products.find(p => p.id === item.product_id);
        if (product) {
            product.stock += item.quantity;
        }
    });
    
    po.status = 'completed';
    showAlert('Purchase order received and stock updated!');
    updatePurchaseOrdersTable();
    updateProductsTable();
    updateDashboard();
}

// CSP-compliant purchase order cancellation with confirmation
function cancelPurchaseOrder(poId) {
    const po = database.purchaseOrders.find(p => p.id === poId);
    if (!po) return;
    
    const modal = createConfirmationModal(
        'Cancel Purchase Order',
        `Are you sure you want to cancel purchase order PO-${String(poId).padStart(4, '0')}?`,
        'cancel-po-confirm',
        poId
    );
    document.body.appendChild(modal);
}

// Create CSP-compliant confirmation modal
function createConfirmationModal(title, message, action, id) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>${title}</h3>
                <button type="button" class="modal-close" data-action="close-modal">&times;</button>
            </div>
            <div class="modal-body">
                <p>${message}</p>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-action="close-modal">Cancel</button>
                <button type="button" class="btn btn-danger" data-action="${action}" data-id="${id}">Confirm</button>
            </div>
        </div>
    `;
    
    modal.addEventListener('click', handleConfirmationModalClick);
    modal.addEventListener('keydown', handleConfirmationModalKeydown);
    
    return modal;
}

// Handle confirmation modal interactions
function handleConfirmationModalClick(e) {
    const action = e.target.getAttribute('data-action');
    const id = parseInt(e.target.getAttribute('data-id'));
    
    if (action === 'close-modal' || e.target.classList.contains('modal-overlay')) {
        closeModal(e.currentTarget);
    } else if (action === 'cancel-order-confirm' && id) {
        const order = database.orders.find(o => o.id === id);
        const orderItems = database.orderItems.filter(item => item.order_id === id);
        
        // Restore stock
        orderItems.forEach(item => {
            const product = database.products.find(p => p.id === item.product_id);
            if (product) {
                product.stock += item.quantity;
            }
        });
        
        order.status = 'cancelled';
        showAlert('Order cancelled and stock restored!');
        updateOrdersTable();
        updateProductsTable();
        updateDashboard();
        closeModal(e.currentTarget);
    } else if (action === 'cancel-po-confirm' && id) {
        const po = database.purchaseOrders.find(p => p.id === id);
        po.status = 'cancelled';
        showAlert('Purchase order cancelled!');
        updatePurchaseOrdersTable();
        updateDashboard();
        closeModal(e.currentTarget);
    }
}

// Handle confirmation modal keyboard interactions
function handleConfirmationModalKeydown(e) {
    if (e.key === 'Escape') {
        closeModal(e.currentTarget);
    }
}

// Update analytics
function updateAnalytics() {
    // Calculate totals
    const totalRevenue = database.orders
        .filter(o => o.status === 'completed')
        .reduce((sum, order) => sum + order.total, 0);
    
    const totalOrdersCount = database.orders.filter(o => o.status === 'completed').length;
    const avgOrderValue = totalOrdersCount > 0 ? totalRevenue / totalOrdersCount : 0;
    
    const inventoryValue = database.products.reduce((sum, product) => sum + (product.stock * product.cost), 0);
    
    // Update analytics stats
    const totalRevenueEl = document.getElementById('total-revenue');
    const totalOrdersCountEl = document.getElementById('total-orders-count');
    const avgOrderValueEl = document.getElementById('avg-order-value');
    const inventoryValueEl = document.getElementById('inventory-value');
    
    if (totalRevenueEl) totalRevenueEl.textContent = totalRevenue.toFixed(2);
    if (totalOrdersCountEl) totalOrdersCountEl.textContent = totalOrdersCount;
    if (avgOrderValueEl) avgOrderValueEl.textContent = avgOrderValue.toFixed(2);
    if (inventoryValueEl) inventoryValueEl.textContent = inventoryValue.toFixed(2);
    
    // Product analytics
    const productAnalytics = database.products.map(product => {
        const soldItems = database.orderItems.filter(item => {
            const order = database.orders.find(o => o.id === item.order_id);
            return item.product_id === product.id && order && order.status === 'completed';
        });
        
        const unitsSold = soldItems.reduce((sum, item) => sum + item.quantity, 0);
        const revenue = soldItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);
        const profit = soldItems.reduce((sum, item) => sum + (item.quantity * (item.price - product.cost)), 0);
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
        
        return {
            product,
            unitsSold,
            revenue,
            profit,
            margin
        };
    }).sort((a, b) => b.revenue - a.revenue);
    
    // Update analytics table
    const analyticsTable = document.getElementById('analytics-table');
    if (analyticsTable) {
        analyticsTable.innerHTML = productAnalytics.map(item => `
            <tr>
                <td>${item.product.name}</td>
                <td>${item.unitsSold}</td>
                <td>$${item.revenue.toFixed(2)}</td>
                <td>$${item.profit.toFixed(2)}</td>
                <td>${item.margin.toFixed(1)}%</td>
            </tr>
        `).join('');
    }
    
    // Top products
    const topProducts = productAnalytics.slice(0, 5);
    const topProductsDiv = document.getElementById('top-products');
    if (topProductsDiv) {
        topProductsDiv.innerHTML = topProducts.map((item, index) => `
            <div class="top-product-item">
                <strong>#${index + 1} ${item.product.name}</strong><br>
                Revenue: $${item.revenue.toFixed(2)} | Units Sold: ${item.unitsSold} | Margin: ${item.margin.toFixed(1)}%
            </div>
        `).join('');
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeData();
    setupEventListeners();
});

// Add modal styles to ensure proper display
function addModalStyles() {
    if (document.getElementById('modal-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'modal-styles';
    style.textContent = `
        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        }
        
        .modal-content {
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            min-width: 400px;
            max-width: 90vw;
        }
        
        .modal-header {
            padding: 1rem;
            border-bottom: 1px solid #e0e0e0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .modal-header h3 {
            margin: 0;
        }
        
        .modal-close {
            background: none;
            border: none;
            font-size: 1.5rem;
            cursor: pointer;
            padding: 0;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .modal-body {
            padding: 1rem;
        }
        
        .modal-footer {
            padding: 1rem;
            border-top: 1px solid #e0e0e0;
            display: flex;
            gap: 0.5rem;
            justify-content: flex-end;
        }
        
        .top-product-item {
            padding: 1rem;
            border-bottom: 1px solid #e0e0e0;
        }
        
        .top-product-item:last-child {
            border-bottom: none;
        }
    `;
    document.head.appendChild(style);
}

// Initialize modal styles when DOM is loaded
document.addEventListener('DOMContentLoaded', addModalStyles);