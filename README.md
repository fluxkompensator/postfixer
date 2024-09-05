# Postfixer

Postfixer (Policydaemon and Ratelimiter for the Postfix SMTP Access Policy Delegation) is a web application for managing and monitoring email filtering rules and rate limiters. It consists of a Flask backend and a React frontend.

I spent some time to get this running, and I will leave an Ära working on large scale Mail Service deployments.
So this for me seemed to be an good solution of viewing realtime traffic of postfix servers and also being able to make adjustments on the fly.
I hope somebody can make some use if this, I will still continue the development, but future features are yet not planned.

## Features

- Real-time monitoring of email requests
- Rule management for email filtering
- Rate limiter configuration
- Dark mode support ;)

## Backend

The backend is built with Flask and uses MongoDB for data storage. It provides RESTful APIs for managing rules and rate limiters, as well as a WebSocket connection for real-time updates.

Key components:
- `main.py`: Main Flask application
- `rules.py`: Rule management logic
- `ratelimiter.py`: Rate limiter implementation
- `config.py`: Configuration and database setup

## Frontend

The frontend is built with React and Material-UI. It provides a user-friendly interface for managing rules, rate limiters, and viewing recent requests.

Key components:
- `App.js`: Main application component
- `Dashboard.js`: Main dashboard layout
- `RulesList.js`: Rule management interface
- `RateLimiterList.js`: Rate limiter configuration
- `RecentRequests.js`: Display of recent email requests

## Getting Started

1. Install dependencies for both backend and frontend
   ```
   cd postfixer-backend
   pip install -r requirements.txt
   cd ../postfixer-frontend
   npm install
   ```
2. Start a MongoDB instance
3. Run the Flask backend:
   ```
   gunicorn --worker-class eventlet -w 1 main:app
   ```
4. Run the React frontend:
   ```
   cd postfixer-frontend
   npm start
   ```

Some screenshots
![rules](https://github.com/user-attachments/assets/20ead41b-5345-4db5-99ff-f5810861da0d)
![recent_reqs](https://github.com/user-attachments/assets/b7bfb8ff-551e-4888-8e26-a2e41933877b)
![ratelimiter](https://github.com/user-attachments/assets/ea37b948-42e9-41cf-8630-d1837892cb0e)


Happy filtering!
