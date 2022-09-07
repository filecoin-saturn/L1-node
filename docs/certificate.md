openssl ecparam -name prime256v1 -genkey -noout -out node.key
openssl req -new -sha256 -key node.key -out node.csr
openssl x509 -req -days 365 -sha256 -in node.csr -signkey node.key -out node.crt