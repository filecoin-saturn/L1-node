import crypto from "crypto";

const ipfsRegex = /^\/ipfs\/(\w+)(\/?.*)/;

function routeRequest(req) {
  const jwt = findJWT(req);
  if (jwt) {
    req.variables.jwt = jwt;
    return req.internalRedirect("@auth_node_backend");
  } else {
    return req.internalRedirect("@node_backend");
  }
}

function isAllowedRequest(req) {
  const matches = req.uri.match(ipfsRegex);
  if (!matches) {
    return req.internalRedirect("@node_backend");
  }
  const cid = matches[1];

  if (isBadBitsCid(cid)) {
    return req.return(410);
  }

  if (!isAllowedDomain(req)) {
    return req.return(403);
  }

  req.internalRedirect("@node_backend");
}

// TODO implement matching CID paths
// TODO convert CID v0 to CID v1
// implementation ref: https://github.com/protocol/bifrost-infra/blob/af46340bd830728b38a0ea632ca517d04277f78c/ansible/roles/nginx_conf_denylist/files/lua/helpers.lua#L80
function isBadBitsCid(cid) {
  // check if root hash(`CID/`) is blocked via denylist.json
  const hashedCID = crypto
    .createHash("sha256")
    .update(cid + "/")
    .digest("hex");

  /* eslint-disable-next-line no-undef */
  return hashedCID in denylist;
}

function isAllowedDomain(req) {
  const allowListStr = req.variables.jwt_claim_allow_list;
  if (!allowListStr) {
    return false;
  }

  let allowList;
  try {
    allowList = JSON.parse(allowListStr);
  } catch (err) {
    return false;
  }

  if (allowList.includes("*")) {
    return true;
  }

  // Only browser requests are allowed for now.
  const requestOrigin = req.variables.http_origin;
  if (!requestOrigin) {
    return false;
  }
  const requestDomain = requestOrigin.replace(/^https?:\/\//, "");

  const isAllowedDomain = allowList.some((domain) => domain === requestDomain);

  return isAllowedDomain;
}

function findJWT(req) {
  const jwtQuery = req.variables.arg_jwt;

  let jwtHeader = "";
  const authHeader = req.variables.http_authorization;
  if (authHeader) {
    jwtHeader = authHeader.replace("Bearer ", "");
  }

  return jwtQuery || jwtHeader;
}

export default { routeRequest, isAllowedRequest, findJWT };
