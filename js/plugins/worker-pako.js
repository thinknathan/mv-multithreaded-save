importScripts('../libs/pako.min.js');

/* @version v1.0.5
 * Web worker that interfaces with Pako
 * Returns a compressed string
 * Template by Gilad Dayagi
 */

// Compresses a string
async function deflateString(data, cb) {
    let result = null,
        err = null;

    if (typeof data === 'string') {
        const compressed = await pako.deflate(data, {
            to: "string",
            level: 1
        });
        const encoded = btoa(compressed);
        result = encoded;
    } else {
        err = 'Not a string';
    }

    const delay = Math.ceil(Math.random() * 1000);
    setTimeout(function () {
        cb(err, result);
    }, delay);
};

// Decompresses a string
async function inflateString(data, cb) {
    let result = null,
        err = null;

    if (typeof data === 'string') {
        const decoded = atob(data);
        const decompressed = await pako.inflate(decoded, {
            to: "string"
        });
        result = decompressed;
    } else {
        err = 'Not a string';
    }

    const delay = Math.ceil(Math.random() * 1000);
    setTimeout(function () {
        cb(err, result);
    }, delay);
};

// Handle incoming messages
self.onmessage = function (msg) {
    const { id, payload } = msg.data;
    const type = payload.requestType;
    const data = payload.data;

    if (type === 'compress') {
        deflateString(data, function (err, result) {
            const msg = { id, err, payload: result }
            self.postMessage(msg);
        });
    } else if (type === 'decompress') {
        inflateString(data, function (err, result) {
            const msg = { id, err, payload: result }
            self.postMessage(msg);
        });
    }

};
