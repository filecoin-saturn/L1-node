# Kubo Tests

Context: https://github.com/filecoin-saturn/L1-node/pull/62

## Installation

```sh
$ git clone git@github.com:filecoin-saturn/kubo.git
$ cd kubo && git switch saturn
$ make test_sharness_deps
```

## Running the tests

```sh
# required: path to https://github.com/filecoin-saturn/L1-node repo.
$ export L1_NODE_REPO_PATH=<path_to_L1_repo>
# optional: send docker logs to this file.
$ export L1_NODE_LOG_FILE=/tmp/node.log

$ ./test/sharness/lib/test-saturn-L1.sh
```

You can also run tests individually

```
$ ./test/sharness/t0110-gateway.sh
```

## Updating

The fork will need to pull from upstream whenever the relevant tests are updated.

```sh
$ git remote add upstream git@github.com:ipfs/kubo.git
$ git fetch upstream
$ git switch saturn
$ git merge upstream/master
```
