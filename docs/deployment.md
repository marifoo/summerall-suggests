# Deployment

1. Fork or clone this repository
2. Enable GitHub Pages in repository settings
3. Choose **Deploy from a branch**, then **main** and **/ (root)**, and save
4. Access your site at `https://<username>.github.io/<repo-name>`

GitHub Pages serves the repository directly, including a repository subpath; no
build, deployment script, backend, or secrets are required. You can also download
or copy **only `index.html`** and open it in a modern browser. The scoring and cache
modules are embedded in named script blocks, preserving their separate interfaces.
Internet access is needed for ESPN data and Tailwind CDN styling. Embedded CSS
keeps spoiler sections hidden even if the styling CDN fails.
