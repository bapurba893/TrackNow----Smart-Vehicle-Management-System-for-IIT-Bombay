# TrackNow frontend

React app for students, drivers, security guards and visitors. See the [main README](../README.md) for the full picture.

```bash
cp .env.example .env    # REACT_APP_API_URL=http://localhost:5001
npm install
npm start               # dev server on http://localhost:3000
CI=true npm test        # plate-parser evals
npm run eval:ocr        # end-to-end OCR accuracy eval (150 synthetic plates)
```
