### Deployment

**Only changes to `container/` and `Dockerfile`** trigger a build

- To deploy to test network, just push to `main`.
- To deploy to main network, create a tag and push it, example:
  ```bash
  git checkout main
  git pull
  git tag $(date +%s)
  git push --follow-tags
  ```
- Bump LAST_VERSION in orchestrator environment variables.

In development, to avoid an automatic CI/CD deployment to the test network when any change is made to the `container/` directory, include `[skip ci]` in the `git commit` message. Like:

```bash
git commit -m "my commit message [skip ci]"
```
