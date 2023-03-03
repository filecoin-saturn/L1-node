const fs = require("fs");
const crypto = require("crypto");

const badbits = {};
const data = JSON.parse(fs.readFileSync("/etc/nginx/denylist.json"));

data.forEach((entry) => (badbits[entry.anchor] = true));

async function filterCID(req) {
	const vars = req.variables;
	const cid = vars.cid.split("/")[2];
	const hashedCID = crypto
		.createHash("sha256")
		.update(crypto.createHash("sha256").update(cid).digest("hex"))
		.digest("hex");

	if (badbits[hashedCID]) {
		req.return(403);
	}
	req.return(200);
}

export default { filterCID };
