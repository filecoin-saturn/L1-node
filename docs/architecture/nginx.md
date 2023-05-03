# Nginx

## Rate limiting

The L1 node is configured to rate limit, per IP address, requests at a rate of 100/s, with bursts of 200 requests in the same second window. Any excess of requests above that burst receive an immediate response of 429.
