class CryptoLib {
    static get instance() {
        return window.crypto.subtle;
    }
}
