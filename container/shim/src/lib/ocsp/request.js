import crypto from "node:crypto";
import rfc2560 from "asn1.js-rfc2560";
import rfc5280 from "asn1.js-rfc5280";

import { toDER } from "./utils.js";

const sha1 = (data) => crypto.createHash("sha1").update(data).digest();

export function generate(rawCert, rawIssuer) {
  const cert = rfc5280.Certificate.decode(toDER(rawCert, "CERTIFICATE"), "der");
  const issuer = rfc5280.Certificate.decode(toDER(rawIssuer, "CERTIFICATE"), "der");

  const tbsCert = cert.tbsCertificate;
  const tbsIssuer = issuer.tbsCertificate;

  const certID = {
    hashAlgorithm: {
      // algorithm: [ 2, 16, 840, 1, 101, 3, 4, 2, 1 ]  // sha256
      algorithm: [1, 3, 14, 3, 2, 26], // sha1
    },
    issuerNameHash: sha1(rfc5280.Name.encode(tbsCert.issuer, "der")),
    issuerKeyHash: sha1(tbsIssuer.subjectPublicKeyInfo.subjectPublicKey.data),
    serialNumber: tbsCert.serialNumber,
  };

  const tbs = {
    version: "v1",
    requestList: [
      {
        reqCert: certID,
      },
    ],
    requestExtensions: [
      {
        extnID: rfc2560["id-pkix-ocsp-nonce"],
        critical: false,
        extnValue: rfc2560.Nonce.encode(crypto.randomBytes(16), "der"),
      },
    ],
  };

  const req = {
    tbsRequest: tbs,
  };

  return {
    id: sha1(rfc2560.CertID.encode(certID, "der")),
    certID,
    data: rfc2560.OCSPRequest.encode(req, "der"),

    // Just to avoid re-parsing DER
    cert,
    issuer,
  };
}
