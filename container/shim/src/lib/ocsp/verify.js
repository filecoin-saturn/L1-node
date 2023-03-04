import crypto from "node:crypto";
import rfc5280 from "asn1.js-rfc5280";

import { parseResponse, sign, toDER, toPEM } from "./utils.js";

function findResponder(issuer, certs, raws) {
  let issuerKey = issuer.tbsCertificate.subjectPublicKeyInfo;
  issuerKey = toPEM(rfc5280.SubjectPublicKeyInfo.encode(issuerKey, "der"), "PUBLIC KEY");

  if (certs.length) {
    const cert = certs[0];
    const signAlg = sign[cert.signatureAlgorithm.algorithm.join(".")];
    if (!signAlg) {
      throw new Error("Unknown signature algorithm " + cert.signatureAlgorithm.algorithm);
    }

    const verify = crypto.createVerify(signAlg);

    verify.update(raws[0]);
    if (!verify.verify(issuerKey, cert.signature.data)) throw new Error("Invalid signature");

    let certKey = cert.tbsCertificate.subjectPublicKeyInfo;
    certKey = toPEM(rfc5280.SubjectPublicKeyInfo.encode(certKey, "der"), "PUBLIC KEY");
    return certKey;
  }

  return issuerKey;
}

export function verify(options, cb) {
  const req = options.request;

  const issuer = req.issuer || rfc5280.Certificate.decode(toDER(options.issuer, "CERTIFICATE"), "der");

  let res = parseResponse(options.response);

  const rawTBS = options.response.slice(res.start, res.end);
  const certs = res.certs;
  const raws = res.certsTbs.map(function (tbs) {
    return options.response.slice(tbs.start, tbs.end);
  });
  res = res.value;

  // Verify signature using CAs Public Key
  const signAlg = sign[res.signatureAlgorithm.algorithm.join(".")];
  if (!signAlg) {
    throw new Error("Unknown signature algorithm " + res.signatureAlgorithm.algorithm);
  }

  const responderKey = findResponder(issuer, certs, raws);

  const verify = crypto.createVerify(signAlg);
  const tbs = res.tbsResponseData;

  const signature = res.signature.data;

  verify.update(rawTBS);
  if (!verify.verify(responderKey, signature)) {
    throw new Error("Invalid signature");
  }

  if (tbs.responses.length < 1) {
    throw new Error("Expected at least one response");
  }

  res = tbs.responses[0];

  // Verify CertID
  if (res.certId.hashAlgorithm.algorithm.join(".") !== req.certID.hashAlgorithm.algorithm.join(".")) {
    throw new Error("Hash algorithm mismatch");
  }

  if (res.certId.issuerNameHash.toString("hex") !== req.certID.issuerNameHash.toString("hex")) {
    throw new Error("Issuer name hash mismatch");
  }

  if (res.certId.issuerKeyHash.toString("hex") !== req.certID.issuerKeyHash.toString("hex")) {
    throw new Error("Issuer key hash mismatch");
  }

  if (res.certId.serialNumber.cmp(req.certID.serialNumber) !== 0) {
    throw new Error("Serial number mismatch");
  }

  const now = Number(new Date());
  const nudge = options.nudge || 60000;
  if (res.thisUpdate - nudge > now || res.nextUpdate + nudge < now) {
    throw new Error("OCSP Response expired");
  }

  return res.certStatus;
}
