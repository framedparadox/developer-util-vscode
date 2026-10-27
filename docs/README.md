# Developer Utility Tools website

Static marketing site (no build step). Open `index.html` in a browser, or serve the folder:

```bash
npx serve website
```

Deploy the `website/` folder to any static host (GitHub Pages, Vercel, Netlify, Cloudflare Pages).
The searchable tool list is generated from `tools.js`. Light/dark mode follows the system setting and can be toggled; the choice is saved in `localStorage`.
