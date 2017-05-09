// importScripts() is not available on NodeJS.
if (!self.importScripts) {
    global.importScripts = function() {
        for (let arg of arguments) {
            require(arg);
        }
    };
}

// Import the minimum set of dependencies.
importScripts(
    '../utils/buffer/BufferUtils.js',
    '../utils/buffer/SerialBuffer.js',
    '../utils/crypto/Crypto.js',
    '../consensus/primitive/Primitive.js',
    '../consensus/primitive/Hash.js',
    '../consensus/block/BlockHeader.js'
);


function onmessage(msg) {

}
