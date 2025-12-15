# HeyNeighbor Data Service

This project implements the backend data service for the **HeyNeighbor** app.  
It is a Node.js + TypeScript service that connects to an Azure-hosted PostgreSQL database.

## 📁 Project Structure
```
Service/
 ├── sql/
 │    ├── heyneighbor_schema.sql      # Database schema
 │    ├── heyneighbor_queries.sql     # SQL select queries for debugging
 │
 ├── src/
 │    ├── types/                      # Type definitions for all DB entities
 │    │     ├── item.ts
 │    │     ├── messages.ts
 │    │     ├── user.ts
 │    │
 │    └── heyNeighborService.ts       # Main Express service
 │
 ├── package.json
 ├── package-lock.json
 ├── .gitignore
 ├── README.md
```

## ⚙️ Setup

### 1. Install dependencies
```bash
npm install

npm install bcyrpt
npm install --save-dev @types/bcrypt
```


### 2. Environment variables
Create a .env file (ignored by Git) with your Azure Postgres credentials:
```
DB_SERVER=your-server.postgres.database.azure.com
DB_PORT=5432
DB_DATABASE=postgres
DB_USER=your-username
DB_PASSWORD=your-password
NODE_ENV=production
```

### 🚀 Running the Service
REST API service
```bash
npm start
```

### 🧭 API Endpoints

**Health Check**
| Method | Endpoint | Description                                         |
| ------ | -------- | --------------------------------------------------- |
| GET    | `/`      | Basic service check (“Hello from HeyNeighbor API!”) |

**👤 Users**
| Method | Endpoint     | Description             |
| ------ | ------------ | ----------------------- |
| GET    | `/users`     | Get all users           |
| GET    | `/users/:id` | Get a single user by ID |
| POST   | `/users`     | Create a new user       |

**📦 Items**
| Method | Endpoint     | Description       |
| ------ | ------------ | ----------------- |
| GET    | `/items`     | Get all items     |
| GET    | `/items/:id` | Get item by ID    |
| POST   | `/items`     | Create a new item |


**💬 Messages**
| Method | Endpoint    | Description          |
| ------ | ----------- | -------------------- |
| GET    | `/messages` | Get all messages     |
| POST   | `/messages` | Create a new message |


# Related Repos
* [Project](https://github.com/calvin-cs262-fall2025-teamG/Project)
* [Client](https://github.com/calvin-cs262-fall2025-teamG/Client)


