// Backend URL. Set REACT_APP_API_URL at build time (e.g. in Vercel project settings).
const BASE_URL = (process.env.REACT_APP_API_URL || 'http://localhost:5001').replace(/\/$/, '');

export default BASE_URL;
