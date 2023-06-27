function setHeaders(req) {
  const format = req.variables.format_final;
  const filename = req.args.filename;

  const pathSegments = req.uri.split("/");
  const cid = pathSegments[2];
  const filePathSegments = pathSegments.slice(3);
  const lastSegment = filePathSegments[filePathSegments.length - 1];

  let name;
  if (filename) {
    name = filename;
  } else if (format === "car") {
    name = cid;
    if (lastSegment) {
      name += "_" + lastSegment;
    }
    name += ".car";
  } else if (format === "raw") {
    name = `${cid}.bin`;
  }

  const value = `attachment; filename="${name}"`;
  req.headersOut["content-disposition"] = value;
}

export default { setHeaders };
