/*:
 * @plugindesc v1.0.4 Save files asynchronously and use deflate compression.
 * @author Think_Nathan, Gilad Dayagi
 */

// Setup localforage
localforage.config({
    name: 'Save',
    driver: localforage.LOCALSTORAGE
});


/**
 * pakoWorker
 * Promise-based wrapper for a worker
 * that compresses and decompresses strings
 *
 * @methods
 *   compress({String})
 *   terminate()
 *
 * @credit Template by Gilad Dayagi
 * =====================================================
 */
(function () {
    const resolves = {};
    const rejects = {};
    let globalMsgId = 0;

    // Activate calculation in the worker, returning a promise
    function sendMsg(payload, worker) {
        const msgId = globalMsgId++;
        const msg = {
            id: msgId,
            payload,
        }
        return new Promise(function (resolve, reject) {
            // save callbacks for later
            resolves[msgId] = resolve;
            rejects[msgId] = reject;
            worker.postMessage(msg);
        })
    };

    // Handle incoming calculation result
    function handleMsg(msg) {
        const {
            id,
            err,
            payload,
        } = msg.data;
        if (payload) {
            const resolve = resolves[id];
            if (resolve) {
                resolve(payload);
            }
        } else {
            // error condition
            const reject = rejects[id];
            if (reject) {
                if (err) {
                    reject(err);
                } else {
                    reject('Got nothing');
                }
            }
        }

        // purge used callbacks
        delete resolves[id];
        delete rejects[id];
    };

    // Wrapper class
    class pakoWorker {
        constructor() {
            this.worker = new Worker('./js/plugins/worker-pako.js');
            this.worker.onmessage = handleMsg;
        }

        compress(str) {
            const payload = {
                data: str,
                requestType: 'compress'
            };
            return sendMsg(payload, this.worker);
        }

        decompress(str) {
            const payload = {
                data: str,
                requestType: 'decompress'
            };
            return sendMsg(payload, this.worker);
        }

        terminate() {
            this.worker.terminate();
        }
    }

    window.pakoWorker = pakoWorker;
})();


/**
 * DataManager
 * =====================================================
 */

// Rewrite core method to be async
DataManager.saveGame = async function (savefileId) {
    try {
        await StorageManager.backup(savefileId);
        return await this.saveGameWithoutRescue(savefileId);
    } catch (e) {
        console.error(e);
        try {
            StorageManager.remove(savefileId);
            StorageManager.restoreBackup(savefileId);
        } catch (e2) {
            console.error(e2);
        }
        return false;
    }
};

// Rewrite core method to be async
DataManager.saveGameWithoutRescue = async function (savefileId) {
    var json = JsonEx.stringify(this.makeSaveContents());
    if (json.length >= 200000) {
        console.warn('Save data too big!');
    }
    await StorageManager.save(savefileId, json);
    this._lastAccessedId = savefileId;
    var globalInfo = this.loadGlobalInfo() || [];
    globalInfo[savefileId] = this.makeSavefileInfo();
    await this.saveGlobalInfo(globalInfo);
    return true;
};


/**
 * StorageManager
 * =====================================================
 */

// New helper
StorageManager.decompressDataWithWorker = async function (data) {
    if (data == null) return "";
    if (data == "") return null;
    let worker = new pakoWorker();
    const decompressedAndDecoded = await worker.decompress(data);
    worker.terminate();
    worker = null;
    return decompressedAndDecoded;
};

// New helper
StorageManager.compressDataWithWorker = async function (data) {
    if (data == null) return "";
    let worker = new pakoWorker();
    const compressedAndEncoded = await worker.compress(data);
    worker.terminate();
    worker = null;
    return compressedAndEncoded;
};

// New helper
// Synchronous fallback
StorageManager.decompressData = function (data) {
    if (data == null) return "";
    if (data == "") return null;
    const decoded = atob(data);
    return pako.inflate(decoded, {
        to: "string"
    });
};


/**
 * Overrides
 */

// Rewrite core method to split into separate functions
StorageManager.backup = function (savefileId) {
    if (this.exists(savefileId)) {
        if (this.isLocalMode()) {
            this.backupLocal(savefileId);
        } else {
            this.backupWeb(savefileId);
        }
    }
};

// Rewrite core method to split into separate functions
StorageManager.cleanBackup = function (savefileId) {
    if (this.backupExists(savefileId)) {
        if (this.isLocalMode()) {
            this.cleanBackupLocal(savefileId);
        } else {
            this.cleanBackupWeb(savefileId);
        }
    }
};

// Rewrite core method to split into separate functions
StorageManager.restoreBackup = function (savefileId) {
    if (this.backupExists(savefileId)) {
        if (this.isLocalMode()) {
            this.restoreBackupLocal(savefileId);
        } else {
            this.restoreBackupWeb(savefileId);
        }
    }
};


/**
 * Local Pathway
 */

// New helper
StorageManager.makeLocalDirectory = function (dirPath) {
    const fs = require('fs');
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath);
    }
};

// New async method
StorageManager.backupLocal = async function (savefileId) {
    const fs = require('fs');
    var data = this.loadFromLocalFile(savefileId, true);
    var compressed = await this.compressDataWithWorker(data);
    var dirPath = this.localFileDirectoryPath();
    var filePath = this.localFilePath(savefileId) + ".bak";
    this.makeLocalDirectory(dirPath);
    fs.promises.writeFile(filePath, compressed);
};

// New async method
StorageManager.cleanBackupLocal = function (savefileId) {
    const fs = require('fs');
    var dirPath = this.localFileDirectoryPath();
    var filePath = this.localFilePath(savefileId);
    fs.promises.unlink(filePath + ".bak");
};

// New async method
StorageManager.restoreBackupLocal = async function (savefileId) {
    const fs = require('fs');
    var data = this.loadFromLocalBackupFile(savefileId);
    var compressed = await this.compressDataWithWorker(data);
    var dirPath = this.localFileDirectoryPath();
    var filePath = this.localFilePath(savefileId);
    this.makeLocalDirectory(dirPath);
    await fs.promises.writeFile(filePath, compressed);
    fs.promises.unlink(filePath + ".bak");
};

// Rewrite core method to be async
StorageManager.saveToLocalFile = async function (savefileId, json) {
    const fs = require('fs');
    var data = await this.compressDataWithWorker(json);
    var dirPath = this.localFileDirectoryPath();
    var filePath = this.localFilePath(savefileId);
    this.makeLocalDirectory(dirPath);
    fs.promises.writeFile(filePath, data);
};

// Rewrite core method to use Pako
StorageManager.loadFromLocalFile = function (savefileId) {
    const fs = require('fs');
    var data = null;
    var filePath = this.localFilePath(savefileId);
    if (fs.existsSync(filePath)) {
        data = fs.readFileSync(filePath, {
            encoding: 'utf8'
        });
    }
    return this.decompressData(data);
};

// New async method
StorageManager.loadFromLocalFileAsync = async function (savefileId) {
    const fs = require('fs');
    var data = null;
    var filePath = this.localFilePath(savefileId);
    if (fs.existsSync(filePath)) {
        data = await fs.promises.readFile(filePath, {
            encoding: 'utf8'
        });
    }
    return await this.decompressDataWithWorker(data);
};

// Rewrite core method to use Pako
StorageManager.loadFromLocalBackupFile = function (savefileId) {
    const fs = require('fs');
    var data = null;
    var filePath = this.localFilePath(savefileId) + ".bak";
    if (fs.existsSync(filePath)) {
        data = fs.readFileSync(filePath, {
            encoding: 'utf8'
        });
    }
    return this.decompressData(data);
};


/**
 * Web Pathway
 */

// New helper
StorageManager.getFromLocalStorage = function (initialKey) {
    const key = 'Save/' + initialKey;
    const data = localStorage.getItem(key);
    if (data == null) return "";
    if (data == "") return null;
    return data.substring(1, data.length - 1);
};

// New async method
StorageManager.backupWeb = async function (savefileId) {
    var data = await this.loadFromWebStorageAsync(savefileId, true);
    var compressed = await this.compressDataWithWorker(data);
    var key = this.webStorageKey(savefileId) + "bak";
    localforage.setItem(key, compressed);
};

// New method to use localforage
StorageManager.cleanBackupWeb = function (savefileId) {
    var key = this.webStorageKey(savefileId);
    localforage.removeItem(key + "bak");
};

// New async method
StorageManager.restoreBackupWeb = async function (savefileId) {
    var data = this.loadFromWebStorageBackup(savefileId);
    var compressed = await this.compressDataWithWorker(data);
    var key = this.webStorageKey(savefileId);
    await localforage.setItem(key, compressed);
    localforage.removeItem(key + "bak");
};

// Rewrite core method to be async
StorageManager.saveToWebStorage = async function (savefileId, json) {
    var key = this.webStorageKey(savefileId);
    var data = await this.compressDataWithWorker(json);
    localforage.setItem(key, data);
};

// Rewrite core method to use Pako
StorageManager.loadFromWebStorage = function (savefileId, async) {
    var key = this.webStorageKey(savefileId);
    var data = this.getFromLocalStorage(key);
    return this.decompressData(data);
};

// New async method
StorageManager.loadFromWebStorageAsync = async function (savefileId, async) {
    var key = this.webStorageKey(savefileId);
    var data = await localforage.getItem(key);
    return await this.decompressDataWithWorker(data);
};

// Rewrite core method to use Pako
StorageManager.loadFromWebStorageBackup = function (savefileId) {
    var key = this.webStorageKey(savefileId) + "bak";
    var data = this.getFromLocalStorage(key);
    return this.decompressData(data);
};

// Rewrite core method because of key name change
StorageManager.webStorageBackupExists = function (savefileId) {
    var key = this.webStorageKey(savefileId) + "bak";
    return !!this.getFromLocalStorage(key);
};

// Rewrite core method because of key name change
StorageManager.webStorageExists = function (savefileId) {
    var key = this.webStorageKey(savefileId);
    return !!this.getFromLocalStorage(key);
};

// Rewrite core method because of key name change
StorageManager.removeWebStorage = function (savefileId) {
    var key = 'Save/' + this.webStorageKey(savefileId);
    localStorage.removeItem(key);
};
