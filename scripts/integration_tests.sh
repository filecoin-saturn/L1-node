#!/bin/bash

set -eux

base_url="$1"

# no expire, allow_list: ['*']
jwtAllowAll="eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJjOWM5YTQ4OC1iMzIyLTQ3NjYtOWQyNy1jZDNjY2YwYjEzOGMiLCJzdWIiOiJhYmMxMjMiLCJzdWJUeXBlIjoiY2xpZW50S2V5IiwiYWxsb3dfbGlzdCI6WyIqIl0sImlhdCI6MTY5Nzc2MDcwNH0.U8yFAzv7LvhWX7QSX5Q084ZRJsgd-PySKIfXFyBmzSZdmrJH3FAlpD5BafMPP0NPzdaoZyv5A8-ssGgGA6HlNg"
# no expire, allow_list: ['google.com', 'cnn.com']
jwtAllowExplicit="eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIzZjQzNmY1Yi02MjE4LTQ4YjktYWM0MS1jZDUwNzAyMTkxYzgiLCJzdWIiOiJhYmMxMjMiLCJzdWJUeXBlIjoiY2xpZW50S2V5IiwiYWxsb3dfbGlzdCI6WyJnb29nbGUuY29tIiwiY25uLmNvbSJdLCJpYXQiOjE2OTc3NjA3NDd9.qApsm_Bcw80MrzuiGxNM9wUD7gkE_D_AhDI8ILWw4i-Tq3nRyEHauJJdhHM5JBWBjQOHFfSi3VFBv1TR3ww5ig"

test_cid () {
  cid="$1"
  expected="$2"
  code="$(curl -sw "%{http_code}\n" -o /dev/null -H "Origin: https://abc.com" "${base_url}/ipfs/${cid}?jwt=${jwtAllowAll}")"
  test "$code" -eq "$expected" || exit 1
}

test_range_request () {
  cid="$1"
  code="$(curl -sw "%{http_code}\n" -o partial.car -H "Origin: https://abc.com" -H "Authorization: Bearer ${jwtAllowAll}" -H "Accept: application/vnd.ipld.car" "${base_url}/ipfs/${cid}")"
  test "$code" -eq 200 || exit 1
  ls -lh partial.car
  ./car ls -v partial.car
}

################
# BAD BITS
################

# we're good this this response code, as going further means a Lassie fetch
not_blocked=501
blocked=410

# negative test case
test_cid "Qmbfrc4cF2X4KXbHuqD593SLnR2xj6hULYTnrj65wKWaKm" "$not_blocked"
# positive test case
test_cid "bafybeibvcisellj6bfzbas3csvioltujjmif5jqpdw5ykvvwujtvt6up7u" "$blocked"
# positive denylist.conf test case
test_cid "bafybeidgnebuxvarpnw2grmkgnamu6cv6" "$blocked"

################
# RANGE REQUESTS
################

# download car tooling
curl -LO -s https://github.com/ipld/go-car/releases/download/v2.8.0/go-car_2.8.0_linux_amd64.tar.gz && tar xzf go-car_2.8.0_linux_amd64.tar.gz

# test_range_request "bafybeifpz6onienrgwvb3mw5rg7piq5jh63ystjn7s5wk6ttezy2gy5xwu/Mexico.JPG"

# simple range request
test_range_request "bafybeifpz6onienrgwvb3mw5rg7piq5jh63ystjn7s5wk6ttezy2gy5xwu/Mexico.JPG?entity-bytes=0:1048576"

test_range_request "QmafUYju2Ab4ETi5HJG1cqjmnjs2xw9PUuBKzU7Hi3zvXU/MC_TheSource.mp4?entity-bytes=0:1048576"

# range request with offset
test_range_request "bafybeifpz6onienrgwvb3mw5rg7piq5jh63ystjn7s5wk6ttezy2gy5xwu/Mexico.JPG?entity-bytes=1048576:2097152"

################
# JWT Auth
################

authentication_err=401 # jwt missing or invalid
authorization_err=403 # jwt doesn't allow request origin
cid="bafybeifpz6onienrgwvb3mw5rg7piq5jh63ystjn7s5wk6ttezy2gy5xwu/Mexico.JPG"
url="${base_url}/ipfs/${cid}?format=car"

echo Requests succeed without a jwt
code="$(curl -sw "%{http_code}\n" -o /dev/null "${url}")"
test "$code" -eq 200 || exit 1

echo Requests fail with explicit allow_list but without an origin header
code="$(curl -sw "%{http_code}\n" -o /dev/null "${url}&jwt=${jwtAllowExplicit}")"
test "$code" -eq "$authorization_err" || exit 1

echo Requests fail with explicit allow_list but not allowed origin
code="$(curl -sw "%{http_code}\n" -o /dev/null -H "Origin: https://abc.com" "${url}&jwt=${jwtAllowExplicit}")"
test "$code" -eq "$authorization_err" || exit 1

echo Requests succeed with a jwt query param
code="$(curl -sw "%{http_code}\n" -o /dev/null -H "Origin: https://abc.com" "${url}&jwt=${jwtAllowAll}")"
test "$code" -eq 200 || exit 1

echo Requests succeed with a jwt auth header
code="$(curl -sw "%{http_code}\n" -o /dev/null -H "Origin: https://abc.com" -H "Authorization: Bearer ${jwtAllowAll}" "${url}")"
test "$code" -eq 200 || exit 1

echo Requests succeed with explicit allow_list and allowed origin
code="$(curl -sw "%{http_code}\n" -o /dev/null -H "Origin: https://google.com" "${url}&jwt=${jwtAllowExplicit}")"
test "$code" -eq 200 || exit 1

echo Requests succeed with allow_list == [*] and without an origin header
code="$(curl -sw "%{http_code}\n" -o /dev/null "${url}&jwt=${jwtAllowAll}")"
test "$code" -eq 200 || exit 1
