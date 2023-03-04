import rfc2560 from "asn1.js-rfc2560";

import { generate } from "./request.js";
import { getAuthorityInfo, getResponse } from "./utils.js";
import { verify } from "./verify.js";

export function check(options, cb) {
  let req;
  try {
    req = generate(options.cert, options.issuer);
  } catch (e) {
    return cb(e);
  }

  const ocspMethod = rfc2560["id-pkix-ocsp"].join(".");
  getAuthorityInfo(req.cert, ocspMethod, function (err, uri) {
    if (err) return cb(err);

    getResponse(uri, req.data, function (err, raw) {
      if (err) return cb(err);

      verify(
        {
          request: req,
          response: raw,
        },
        cb
      );
    });
  });
}
