# AegisElect - Secure Transparent Online Voting System (STOV)

AegisElect is a highly secure, full-stack voting system built with FastAPI, React, PostgreSQL, Facial Recognition, and Blockchain integration.

## Prerequisites
Before running the project, ensure you have the following installed:
- **Docker & Docker Compose** (For running the backend, database, and local blockchain)
- **Node.js** (v18+ recommended, for running the Vite React frontend)
- **npm** or **yarn**

## 1. Backend Setup & Configuration

The backend is completely containerized. Before starting it, you need to create an environment variables file.

1. In the root directory (next to `docker-compose.yml`), create a file named `.env`.
2. Copy and paste the following configuration into the `.env` file:

```env
# Database Configuration (Matches docker-compose.yml)
DATABASE_URL=postgresql://stov_admin:securepassword123@db:5432/stov_database

# Admin Master Key (Required to register the very first Administrator account)
ADMIN_MASTER_KEY=AEGISELECT-ADMIN-MASTER-KEY

# Email Configuration (For Forgot Password & Notifications)
# Note: Use an App Password if using Gmail, not your actual account password.
MAIL_USERNAME=your-email@gmail.com
MAIL_PASSWORD=your-16-digit-app-password
MAIL_FROM=your-email@gmail.com
MAIL_PORT=465
MAIL_SERVER=smtp.gmail.com
MAIL_STARTTLS=False
MAIL_SSL_TLS=True

# Frontend URL (Used for generating email links)
FRONTEND_URL=http://localhost:5173
```

## 2. Starting the Backend Services

Once your `.env` file is ready, you can start the backend infrastructure using Docker Compose. Open your terminal in the root directory and run:

```bash
docker-compose up --build
```
*(Tip: You can add `-d` to the end of the command to run it in the background/detached mode).*

This single command spins up four services:
1. **PostgreSQL Database** (`db` on port 5432)
2. **FastAPI Backend** (`web` on port 8000)
3. **Adminer Database GUI** (`adminer` on port 8080)
4. **Ganache Local Blockchain** (`blockchain` on port 8545)

## 3. Starting the Frontend

Open a **new** terminal window (leave the backend terminal running if you didn't use `-d`).

Navigate into the `frontend` folder, install the dependencies, and start the development server:

```bash
cd frontend
npm install
npm run dev
```

## 4. Accessing the Application

Once everything is running, you can access the different parts of the system here:

- **Frontend Web App:** http://localhost:5173
- **Backend API & Swagger Docs:** http://localhost:8000/docs
- **Database Management (Adminer):** http://localhost:8080
  - *System:* PostgreSQL
  - *Server:* db
  - *Username:* stov_admin
  - *Password:* securepassword123
  - *Database:* stov_database

## 5. First-Time Usage (Creating an Admin)

By default, there are no users in the database. To create the first Administrator:

1. Go to the frontend registration page (`http://localhost:5173/register`).
2. Fill out the registration form.
3. In the **Admin Master Key** field (usually hidden or optional depending on UI), enter the `ADMIN_MASTER_KEY` from your `.env` file (`AEGISELECT-ADMIN-MASTER-KEY`).
4. Complete the facial scan to register.

You will now have full access to the Admin Dashboard to create elections and generate voter registration tokens!

---
### Troubleshooting
- **Database Connection Error:** Ensure Docker is fully running before starting the containers.
- **Face Recognition Fails to Load:** Ensure you grant your browser permission to access the webcam.
- **Email Not Sending:** Verify that you have created a "Google App Password" if using Gmail, and ensure `MAIL_PORT` is `465` with `MAIL_SSL_TLS=True`.