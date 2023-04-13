#!/bin/bash

set -eux

base_url="$1"

test_cid () {
  cid="$1"
  expected="$2"
  code="$(curl -sw "%{http_code}\n" -o /dev/null "${base_url}/ipfs/${cid}")"
  test "$code" -eq "$expected" || exit 1
}

test_range_request () {
  cid="$1"
  code="$(curl -sw "%{http_code}\n" -o partial.car -H "Accept: application/vnd.ipld.car" "${base_url}/ipfs/${cid}")"
  test "$code" -eq 200 || exit 1
  ls -lh partial.car
  car ls -v partial.car
}

# we're good this this response code, as going further means a Lassie fetch
not_blocked=501
blocked=403

# negative test case
test_cid "Qmbfrc4cF2X4KXbHuqD593SLnR2xj6hULYTnrj65wKWaKm" "$not_blocked"
# positive test case
test_cid "bafybeibvcisellj6bfzbas3csvioltujjmif5jqpdw5ykvvwujtvt6up7u" "$blocked"
# positive denylist.conf test case
test_cid "bafybeidgnebuxvarpnw2grmkgnamu6cv6" "$blocked"

# download car tooling
curl -LO -s https://github.com/ipld/go-car/releases/download/v2.8.0/go-car_2.8.0_linux_amd64.tar.gz && tar xzf go-car_2.8.0_linux_amd64.tar.gz

# simple range request
test_range_request "bafybeifpz6onienrgwvb3mw5rg7piq5jh63ystjn7s5wk6ttezy2gy5xwu/Mexico.JPG"
