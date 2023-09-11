/* eslint-disable no-undef */
import crypto from "crypto";

const ipfsRegex = /^\/ipfs\/(\w+)(\/?.*)/;

// TODO implement matching CID paths
// TODO convert CID v0 to CID v1
// implementation ref: https://github.com/protocol/bifrost-infra/blob/af46340bd830728b38a0ea632ca517d04277f78c/ansible/roles/nginx_conf_denylist/files/lua/helpers.lua#L80
function filterCID(req) {
  const matches = req.uri.match(ipfsRegex);
  if (!matches) {
    return req.internalRedirect("@node_backend");
  }

  const cid = matches[1];
  // check if root hash(`CID/`) is blocked via denylist.json
  const hashedCID = crypto
    .createHash("sha256")
    .update(cid + "/")
    .digest("hex");

  if (denylist[hashedCID]) {
    return req.return(410);
  }

  req.internalRedirect("@node_backend");
}

export default { filterCID };
