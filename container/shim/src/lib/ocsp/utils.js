import http from "node:http";
import rfc2560 from "asn1.js-rfc2560";

export function getResponse(uri, req, cb) {
  uri = new URL(uri);

  const options = Object.assign(uri, {
    method: "POST",
    headers: {
      "Content-Type": "application/ocsp-request",
      "Content-Length": req.length,
    },
  });

  function done(err, response) {
    if (cb) cb(err, response);
    cb = null;
  }

  function onResponse(response) {
    if (response.statusCode < 200 || response.statusCode >= 400) {
      return done(new Error("Failed to obtain OCSP response: " + response.statusCode));
    }

    const chunks = [];
    response.on("readable", function () {
      const chunk = response.read();
      if (!chunk) return;
      chunks.push(chunk);
    });
    response.on("end", function () {
      const ocsp = Buffer.concat(chunks);

      done(null, ocsp);
    });
  }

  http.request(options, onResponse).on("error", done).end(req);
}

export function parseResponse(raw) {
  const body = { start: 0, end: raw.length };
  const response = rfc2560.OCSPResponse.decode(raw, "der", {
    track: function (key, start, end, type) {
      if (type !== "content" || key !== "responseBytes/response") return;
      body.start = start;
      body.end = end;
    },
  });

  const status = response.responseStatus;
  if (status !== "successful") throw new Error("Bad OCSP response status: " + status);

  // Unknown response type
  const responseType = response.responseBytes.responseType;
  if (responseType !== "id-pkix-ocsp-basic") throw new Error("Unknown OCSP response type: " + responseType);

  const bytes = response.responseBytes.response;

  const tbs = { start: body.start, end: body.end };
  const certsTbs = [];
  const basic = rfc2560.BasicOCSPResponse.decode(bytes, "der", {
    track: function (key, start, end, type) {
      if (type !== "tagged") return;

      if (key === "tbsResponseData") {
        tbs.start = body.start + start;
        tbs.end = body.start + end;
      } else if (key === "certs/tbsCertificate") {
        certsTbs.push({ start: body.start + start, end: body.start + end });
      }
    },
  });

  const OCSPSigning = "1.3.6.1.5.5.7.3.9";
  const certs = (basic.certs || []).filter(function (cert) {
    return cert.tbsCertificate.extensions.some(function (ext) {
      if (ext.extnID !== "extendedKeyUsage") return false;

      return ext.extnValue.some(function (value) {
        return value.join(".") === OCSPSigning;
      });
    });
  });

  return {
    start: tbs.start,
    end: tbs.end,
    value: basic,
    certs,
    certsTbs,
  };
}

export const sign = {
  "1.2.840.113549.1.1.5": "sha1WithRSAEncryption",
  "1.2.840.113549.1.1.11": "sha256WithRSAEncryption",
  "1.2.840.113549.1.1.12": "sha384WithRSAEncryption",
  "1.2.840.113549.1.1.13": "sha512WithRSAEncryption",
  "1.2.840.10045.4.3.3": "sha384",
};

export function toPEM(buf, label) {
  const p = buf.toString("base64");
  const out = ["-----BEGIN " + label + "-----"];
  for (let i = 0; i < p.length; i += 64) out.push(p.slice(i, i + 64));
  out.push("-----END " + label + "-----");
  return out.join("\n");
}

export function toDER(raw, what) {
  let der = raw.toString().match(new RegExp("-----BEGIN " + what + "-----([^-]*)-----END " + what + "-----"));
  if (der) der = Buffer.from(der[1].replace(/[\r\n]/g, ""), "base64");
  else if (typeof raw === "string") der = Buffer.from(raw);
  else der = raw;
  return der;
}

export function getAuthorityInfo(cert, key, done) {
  let exts = cert.tbsCertificate.extensions;
  if (!exts) exts = [];

  const infoAccess = exts.filter((ext) => ext.extnID === "authorityInformationAccess");

  if (infoAccess.length === 0) throw new Error("AuthorityInfoAccess not found in extensions");

  let res = null;
  const found = infoAccess.some(function (info) {
    const ext = info.extnValue;

    return ext.some(function (ad) {
      if (ad.accessMethod.join(".") !== key) return false;

      const loc = ad.accessLocation;
      if (loc.type !== "uniformResourceIdentifier") return false;

      res = String(loc.value);

      return true;
    });
  });

  if (!found) throw new Error(key + " not found in AuthorityInfoAccess");

  return res;
}
