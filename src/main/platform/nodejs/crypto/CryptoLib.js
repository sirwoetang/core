const WebCrypto = require("node-webcrypto-ossl");
const WebCrypto_instance = new WebCrypto({
    directory: "database/keys"
});

const CryptoLib = {
    instance: WebCrypto_instance
};
