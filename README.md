# 📦 Inventory Management System

A simple and scalable Inventory Management System for small to medium businesses and e-commerce platforms.  
Built with HTML/CSS/JS frontend and a Node.js + Express backend, using Sequelize ORM and SQLite as the database.

---

## 🚀 Features

- Add / View / Delete Products
- Manage Suppliers
- Create & Track Customer Orders
- Create Purchase Orders for Restocking
- Dashboard with Low Stock Alerts
- Basic Sales Analytics

---

## 🧱 Tech Stack

| Layer     | Technology          |
|-----------|---------------------|
| Frontend  | HTML, CSS, JavaScript |
| Backend   | Node.js, Express     |
| ORM       | Sequelize            |
| Database  | SQLite (small scale) |

---

## 🗂️ Project Structure

inventory-management-backend/
├── config/ # DB configuration
├── controllers/ # Business logic
├── models/ # Sequelize models
├── routes/ # API endpoints
├── database.sqlite # SQLite database file
├── index.js # Entry point
└── README.md


---

## 🔧 Installation

```bash
# Clone the repo
git clone https://github.com/your-username/inventory-management-backend.git

cd inventory-management-backend

# Install dependencies
npm install
# Start the backend server
node index.js
By default, it runs on: http://localhost:5000


#API ENDPOINTS
| Method | Endpoint             | Description             |
| ------ | -------------------- | ----------------------- |
| GET    | /api/products        | Get all products        |
| POST   | /api/products        | Add a new product       |
| GET    | /api/suppliers       | Get all suppliers       |
| POST   | /api/suppliers       | Add a supplier          |
| GET    | /api/orders          | Get all orders          |
| POST   | /api/orders          | Create customer order   |
| GET    | /api/purchase-orders | Get all purchase orders |
| POST   | /api/purchase-orders | Create purchase order   |


# Sample Data
Sample products and suppliers can be seeded using Sequelize or added manually from the frontend UI.

# License
This project is for educational and demonstration purposes.

#Author
Aditi Sharma
B.TECH Electronics and Communication Engineering with AI| IGDTUW
https://www.linkedin.com/in/aditi-sharma-b7b254324/

