# 📦 Inventory Management System

A full-stack Inventory Management System designed for small and medium-sized businesses and e-commerce platforms. The application helps businesses manage products, suppliers, sales orders, purchase orders, stock movements, and inventory analytics through a modern web interface.

Built using **React, Node.js, Express.js, and MongoDB**, with JWT-based authentication and owner-scoped data management.

---

## 🚀 Features

### 1. Authentication & User Management
- User registration and login.
- JWT-based authentication.
- Protected API routes.
- Separate inventory data for each user.

### 2. Product Management
- Add, view, update, and manage products.
- Product SKU and barcode management.
- Product categories and supplier association.
- Stock quantity and low-stock monitoring.
- Stock adjustments with audit tracking.

### 3. Supplier Management
- Add and manage suppliers.
- Maintain supplier contact and business information.
- Associate products with suppliers.
- Prevent deletion of suppliers associated with existing products or purchase orders.

### 4. Sales Order Management
- Create and manage customer orders.
- Automatic stock deduction when an order is created.
- Order status management.
- Stock restoration on cancellation.
- Idempotent order processing to prevent duplicate stock deductions.

### 5. Purchase Order Management
- Create and manage purchase orders.
- Track ordered and received quantities.
- Support partial stock receipts.
- Automatically update inventory when goods are received.
- Idempotent receipt processing.

### 6. Dashboard & Analytics
- Inventory and sales overview.
- Low-stock monitoring.
- Product and category metrics.
- Revenue and order analytics.

### 7. Inventory Audit & Data Integrity
- Stock movement tracking.
- Owner-scoped database queries.
- Transaction-based stock operations.
- Duplicate request protection through idempotency keys.

---

## 🛠️ Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React, JavaScript, Vite |
| Styling | CSS |
| Backend | Node.js, Express.js |
| Database | MongoDB Atlas |
| ODM | Mongoose |
| Authentication | JWT, bcryptjs |
| API Security | Helmet, CORS, Express Rate Limit |
| Testing | Node.js Test Runner, Proxyquire |
| Development Tools | Git, GitHub, Postman |

---

## 📁 Project Structure

```text
E-Commerce Inventory Management System/
│
├── Backend/
│   ├── config/
│   │   └── mongodb.js
│   │
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── mongoAnalyticsController.js
│   │   ├── mongoDashboardController.js
│   │   ├── mongoOrderController.js
│   │   ├── mongoProductController.js
│   │   ├── mongoPurchaseOrderController.js
│   │   └── mongoSupplierController.js
│   │
│   ├── middleware/
│   │
│   ├── models/
│   │   └── mongo/
│   │       ├── User.js
│   │       ├── Product.js
│   │       ├── Supplier.js
│   │       ├── Order.js
│   │       ├── PurchaseOrder.js
│   │       └── StockMovement.js
│   │
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── mongoAnalyticsRoutes.js
│   │   ├── mongoDashboardRoutes.js
│   │   ├── mongoOrderRoutes.js
│   │   ├── mongoProductRoutes.js
│   │   ├── mongoPurchaseOrderRoutes.js
│   │   └── mongoSupplierRoutes.js
│   │
│   ├── services/
│   ├── tests/
│   ├── index.js
│   ├── package.json
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── assets/
│   │   ├── components/
│   │   ├── features/
│   │   ├── layouts/
│   │   ├── pages/
│   │   └── routes/
│   │
│   ├── public/
│   ├── index.html
│   ├── package.json
│
└── README.md
```

---

## ⚙️ Installation & Setup

### Prerequisites

- Node.js (version 18 or later)
- npm
- MongoDB Atlas account or a MongoDB instance
- Git

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd "E-Commerce Inventary Management System"
```

### 2. Backend Setup

```bash
cd Backend
npm install
```

Create a `.env` file using `.env.example` as a reference.

Configure the following environment variables:

```env
PORT=3000
NODE_ENV=development
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_secure_jwt_secret
```

Use your own secure credentials. Never commit the `.env` file.

Start the backend:

```bash
npm start
```

For development:

```bash
npm run dev
```

Backend runs at:

`http://localhost:3000`

Health check:

`http://localhost:3000/health`

### 3. Frontend Setup

Open a separate terminal:

```bash
cd frontend
npm install
```

Create a `.env.local` file:

```env
VITE_API_BASE_URL=http://localhost:3000/api/v1
```

Start the React development server:

```bash
npm run dev
```

The Vite development server runs at:

`http://localhost:5173`

---

## 🔗 API Overview

All application APIs are grouped under:

`/api/v1`

| Module | Base Endpoint | Purpose |
|---|---|---|
| Authentication | `/api/v1/auth` | Registration and login |
| Products | `/api/v1/products` | Product and stock management |
| Suppliers | `/api/v1/suppliers` | Supplier management |
| Sales Orders | `/api/v1/orders` | Customer order management |
| Purchase Orders | `/api/v1/purchase-orders` | Inventory replenishment |
| Dashboard | `/api/v1/dashboard` | Dashboard metrics |
| Analytics | `/api/v1/analytics` | Inventory and sales analytics |

Protected endpoints require a valid JWT access token in the Authorization header:

```http
Authorization: Bearer <access_token>
```

---

## 🧪 Testing

### Backend Tests

From the `Backend` directory:

```bash
npm test
```

Run the authentication integration tests separately:

```bash
npm run test:integration
```

### Frontend Production Build

From the `frontend` directory:

```bash
npm run build
```

---

## 🗄️ Database Architecture

The application uses **MongoDB with Mongoose** as its database layer.

Key database models include:

- User
- Product
- Supplier
- Order
- PurchaseOrder
- StockMovement

The application uses owner-scoped records to keep each user's inventory data separate.

Stock operations are designed to maintain consistency through database transactions, audit records, and idempotency protection.

---

## 🔒 Security

- JWT-based authentication.
- Password hashing using bcryptjs.
- Protected API routes.
- Owner-level data isolation.
- Request validation.
- Security headers using Helmet.
- CORS configuration.
- Rate limiting.

---

## 👩‍💻 Author

**Aditi Sharma**

B.Tech, Electronics and Communication Engineering with AI
Indira Gandhi Delhi Technical University for Women (IGDTUW)