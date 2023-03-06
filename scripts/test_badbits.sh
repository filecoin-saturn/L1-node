set -eux

base_url="$1"

test_cid () {
				cid="$1"
				expected="$2"
				code="$(curl -sw '%{http_code}\n' -o /dev/null "${base_url}/ipfs/${cid}")"
				test "$code" -eq "$expected" || exit 1
}

not_blocked=501
blocked=403

# negative test case
test_cid "Qmbfrc4cF2X4KXbHuqD593SLnR2xj6hULYTnrj65wKWaKm" "$not_blocked"
# positive test case
test_cid "bafybeibvcisellj6bfzbas3csvioltujjmif5jqpdw5ykvvwujtvt6up7u" "$blocked"
