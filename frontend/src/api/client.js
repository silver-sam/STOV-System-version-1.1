import axios from 'axios';

// 1. Create a custom Axios instance
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api', // Uses env var in production, /api in dev
  headers: {
    'Content-Type': 'application/json',
  },
});

// 2. Request Interceptor: Attaches the Token
// Before any request is sent, this code runs.
apiClient.interceptors.request.use(
  (config) => {
    // We will store the token in localStorage with the key 'access_token'
    const token = localStorage.getItem('access_token');
    
    if (token) {
      // If a token exists, attach it to the Authorization header
      // Format: "Bearer <token>"
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 3. Response Interceptor: Handles Token Expiration
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // If the backend says "401 Unauthorized", it means our token is bad/expired
    if (error.response && error.response.status === 401) {
      // Clear the invalid token so the user is forced to log in again
      localStorage.removeItem('access_token');
      // Optionally redirect to login page here:
      // window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;