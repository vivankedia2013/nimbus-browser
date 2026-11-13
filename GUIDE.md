# Publishing Nimbus on GitHub

1. Create a **public** repo named `nimbus-browser` (leave README, .gitignore and license unticked).
2. Upload everything in this folder: `main.js`, `preload.js`, `package.json`, `README.md`, `LICENSE`, `CHANGELOG.md`, `.gitignore`, and the folders `src`, `build`, `docs`.
3. Create `.github/workflows/build.yml` on GitHub (**Add file → Create new file**) and paste in the contents of `docs/build.yml.txt`.
4. **Releases → Create a new release**, tag `v1.1.0`, publish. GitHub Actions builds the installers (about 15 to 25 minutes) and attaches them to the release.
5. Repo **About** → add the description and topics from the README.
