import rfc2560 from "asn1.js-rfc2560";

import { generate } from "./request.js";
import { getAuthorityInfo, getResponse } from "./utils.js";
import { verify } from "./verify.js";
import { promisify } from "node:util";

const asyncGetResponse = promisify(getResponse);

export async function check(cert, issuerCert) {
  const req = generate(cert, issuerCert);

  const ocspMethod = rfc2560["id-pkix-ocsp"].join(".");
  const uri = getAuthorityInfo(req.cert, ocspMethod);

  const raw = await asyncGetResponse(uri, req.data);

  return verify({
    request: req,
    response: raw,
  });
}
