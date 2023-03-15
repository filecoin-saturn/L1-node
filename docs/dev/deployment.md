### Release & Deployment

Note: **Only changes to `container/` and `Dockerfile`** will trigger a release.

In development, to avoid an automatic CI/CD release and subsequent deployment to the `test network` when a change is made to the `container/**` directory, include `[skip ci]` in the `git commit` message. Like so:

```bash
git commit -m "my commit message [skip ci]"
```

Changes are meant to be deployed as shown below:

`test network` -> `canary subnetwork` -> `main network`

A `canary` tag is one that matches `canary-*`. A non-`canary` is any that does not match the previous expression.

#### Test network

To release to the `test network`, push to the `main` git branch.

[The release CI pipeline](.github/workflows/release.yml) will handle this process. Check your progress [here](https://github.com/filecoin-saturn/L1-node/actions/workflows/release.yml) by looking at the last pipeline targeting the `main` git branch.

After releasing is over, all `test network` nodes will pick up and deploy the latest `test` mutable docker tag.

#### Canary subnetwork

The `canary subnetwork` is a managed/core node subset of the `main network`. It's part of the staged deployments pipeline and is meant to validate changes on a production-equivalent environment prior to those changes getting rolled to the whole `main network`.

To release to the `canary subnetwork`, create a canary tag and push it. For example:

```bash
git checkout main
git pull
git tag "canary-$(date +%s)"
git push --follow-tags
```

[The release CI pipeline](.github/workflows/release.yml) will handle this process and publish a docker image tagged with `canary`. Check your progress [here](https://github.com/filecoin-saturn/L1-node/actions/workflows/release.yml) by looking at the last pipeline targeting a canary git tag.

After releasing is over, all `canary subnetwork` nodes will pick up and deploy the latest `canary` mutable docker tag.

#### Main network

Keep in mind the `main network` is a production environment. **Make sure**, your changes were validated in the `test network` and then staged to the `canary subnetwork` before going forward.

To release to `main network`, create a non-canary git tag and push it. For example:

```bash
git checkout main
git pull
git tag "$(date +%s)"
git push --follow-tags
```

[The release CI pipeline](https://github.com/filecoin-saturn/L1-node/blob/main/.github/workflows/release.yml) will handle this process and publish a docker image tagged with `main`. Check your progress [here](https://github.com/filecoin-saturn/L1-node/actions/workflows/release.yml) by looking at the last pipeline targeting a non-canary git branch.

After releasing is over, all `main network` nodes will pick up and deploy the latest `main` mutable docker tag.
